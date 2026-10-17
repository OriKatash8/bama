import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import {
  canSkipReencode,
  parseProbe,
  ProbeInfo,
  REENCODE_MAXRATE_KBPS,
  SCALE_TO_1080P_FILTER,
} from './policy';

ffmpeg.setFfmpegPath(ffmpegStatic as string);

/** `ffmpeg -i file` always exits 1 (no output given); the stream info is on stderr. */
function probe(file: string): Promise<ProbeInfo | null> {
  return new Promise((resolve) => {
    execFile(ffmpegStatic as string, ['-hide_banner', '-i', file], { maxBuffer: 4 * 1024 * 1024 }, (_err, _out, stderr) => {
      try {
        resolve(parseProbe(String(stderr)));
      } catch {
        resolve(null);
      }
    });
  });
}

function runFfmpeg(input: string, output: string, options: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    ffmpeg(input)
      .outputOptions(options)
      .output(output)
      .on('start', (cmd) => console.log('[ffmpeg] command:', cmd))
      .on('stderr', (line) => console.log('[ffmpeg stderr]', line))
      .on('end', () => resolve())
      .on('error', (err: Error) => {
        console.log('[ffmpeg] error stack:', err?.message);
        reject(err);
      })
      .run();
  });
}

// Already-compressed upload (the app's on-device pass): only rewrite the container so the
// moov atom is up front for streaming. No decode/encode, takes seconds.
const REMUX_OPTIONS = ['-c', 'copy', '-movflags', '+faststart'];

const REENCODE_OPTIONS = [
  '-vf', SCALE_TO_1080P_FILTER, // fit within 1080p, never upscale, even sides (yuv420p)
  '-c:v', 'libx264',
  '-preset', 'veryfast',
  '-crf', '23',
  '-maxrate', `${REENCODE_MAXRATE_KBPS}k`,
  '-bufsize', `${REENCODE_MAXRATE_KBPS * 2}k`,
  '-c:a', 'aac',
  '-b:a', '128k',
  '-movflags', '+faststart',
  '-pix_fmt', 'yuv420p',
];

export const compressVideo = functions.storage.onObjectFinalized(
  {
    timeoutSeconds: 300,
    memory: '1GiB',
    region: 'europe-west1',
  },
  async (event) => {
    const filePath = event.data.name;
    const contentType = event.data.contentType;

    if (!contentType?.startsWith('video/')) return;
    if (
      !filePath.startsWith('portfolio/') &&
      !filePath.startsWith('chat-videos/') &&
      !filePath.startsWith('courses/')
    ) return;
    if (filePath.includes('_compressed')) return;

    const bucket = admin.storage().bucket(event.data.bucket);
    const fileName = path.basename(filePath);
    const fileNameWithoutExt = path.parse(fileName).name;
    const compressedFileName = `${fileNameWithoutExt}_compressed.mp4`;
    const compressedFilePath = path.join(path.dirname(filePath), compressedFileName);

    const jobId = Buffer.from(filePath).toString('base64').replace(/[/+=]/g, '_');

    await admin.firestore().doc(`videoJobs/${jobId}`).set({
      status: 'processing',
      originalPath: filePath,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const tempDir = os.tmpdir();
    const tempInput = path.join(tempDir, fileName);
    const tempOutput = path.join(tempDir, compressedFileName);

    try {
      await bucket.file(filePath).download({ destination: tempInput });

      const info = await probe(tempInput);
      const skip = canSkipReencode(info, event.data.size ? Number(event.data.size) : fs.statSync(tempInput).size);
      console.log('[compressVideo]', filePath, 'probe:', JSON.stringify(info), '→', skip ? 'remux only' : 're-encode');

      let reencoded = !skip;
      if (skip) {
        try {
          await runFfmpeg(tempInput, tempOutput, REMUX_OPTIONS);
        } catch {
          reencoded = true; // odd container/stream that will not copy cleanly: do it the long way
        }
      }
      if (reencoded) await runFfmpeg(tempInput, tempOutput, REENCODE_OPTIONS);

      // Generate a permanent Firebase Storage download URL with an embedded token.
      // This works regardless of GCS bucket ACL settings and is compatible with
      // Firebase Storage security rules — no makePublic() required.
      const token = randomUUID();

      await bucket.upload(tempOutput, {
        destination: compressedFilePath,
        metadata: {
          contentType: 'video/mp4',
          metadata: { firebaseStorageDownloadTokens: token },
        },
      });

      const encodedPath = encodeURIComponent(compressedFilePath);
      const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;

      await admin.firestore().doc(`videoJobs/${jobId}`).update({
        status: 'done',
        reencoded,
        compressedPath: compressedFilePath,
        url: publicUrl,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await bucket.file(filePath).delete();
    } catch (error) {
      await admin.firestore().doc(`videoJobs/${jobId}`).update({
        status: 'error',
        error: String(error),
      });
      throw error;
    } finally {
      if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
      if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
    }
  }
);
