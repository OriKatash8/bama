import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

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
    if (!filePath.startsWith('portfolio/') && !filePath.startsWith('chat-videos/')) return;
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
          .videoCodec('libx264')
          .audioCodec('aac')
          .size('?x720')
          .videoBitrate('800k')
          .audioBitrate('128k')
          .outputOptions(['-movflags faststart', '-preset fast'])
          .output(tempOutput)
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err))
          .run();
      });

      await bucket.upload(tempOutput, {
        destination: compressedFilePath,
        metadata: { contentType: 'video/mp4' },
      });

      await bucket.file(compressedFilePath).makePublic();
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${compressedFilePath}`;

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
