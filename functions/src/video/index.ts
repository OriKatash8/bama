import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

ffmpeg.setFfmpegPath(ffmpegStatic as string);

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

      await new Promise<void>((resolve, reject) => {
        ffmpeg(tempInput)
          .outputOptions([
            '-vf', 'scale=-2:720',  // scale to 720p; -2 keeps width even (required by yuv420p)
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            '-pix_fmt', 'yuv420p',
          ])
          .output(tempOutput)
          .on('start', (cmd) => console.log('[ffmpeg] command:', cmd))
          .on('stderr', (line) => console.log('[ffmpeg stderr]', line))
          .on('end', () => resolve())
          .on('error', (err: Error) => {
            console.log('[ffmpeg] error stack:', err?.message);
            reject(err);
          })
          .run();
      });

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
