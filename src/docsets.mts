import fs from 'fs-extra';
import ky from 'ky';
import { extract } from 'tar';
import { temporaryFile } from 'tempy';
import { logger } from './logger.mjs';
import { Metadata } from './metadata.mjs';
import { sample } from 'es-toolkit/array';
import { ByteStreamProgress } from './streams.mjs';
import { Writable } from 'stream';

export interface DocsetAuthor {
  name: string;
  link: string;
}

export interface DocsetVersion {
  version: string;
  archive: string;
  author?: DocsetAuthor;
}

/* eslint-disable @typescript-eslint/naming-convention */
export interface Docset {
  // Directory-name friendly
  id: string;

  // Display friendly, possibly directory-name unfriendly
  name: string;

  version: string;
  specific_version: DocsetVersion[];

  archive: string;
  aliases: string[];

  // Base64 strings of the icon
  icon?: string;
  'icon@2x'?: string;

  author: DocsetAuthor;
}
/* eslint-enable @typescript-eslint/naming-convention */

export async function getAvailableDocsets(mirror?: string): Promise<Docset[]> {
  mirror = mirror !== undefined ? mirror + '.' : '';

  const url = `https://${mirror}kapeli.com/feeds/zzz/user_contributed/build/index.json`;
  const body = await ky.get(url).json<{ docsets: Record<string, Docset> }>();

  return Object.keys(body.docsets).map(key => {
    return {
      id: key,
      ...body.docsets[key],
    };
  });
}

export async function downloadDocset(
  docset: Docset,
  metadata: Metadata,
  showProgress: boolean = true,
): Promise<string> {
  // By default a random url is chosen, just like how Zeal would download a docset
  // If a mirror is specified with --mirror, metadata.urls will only contain one url
  const archiveUrl = sample(metadata.urls);

  const tempPath = temporaryFile({ name: `${docset.name}.tar.gz` });

  logger.info(`Downloading docset from ${archiveUrl}`);

  const resp = await fetch(archiveUrl);
  const body = resp.body;
  let readable = body;

  if (showProgress) {
    const bar = logger.progress();

    readable = readable.pipeThrough(
      ByteStreamProgress.transformStreamFromResponse(resp, ({ percent }: { percent: number }) => {
        bar.update(percent);
      }),
    );
  }

  await readable.pipeTo(Writable.toWeb(fs.createWriteStream(tempPath)));
  return tempPath;
}

export async function extractDocset(tempPath: string, docsetDirectory: string): Promise<void> {
  logger.info(`Extracting docset to ${docsetDirectory}`);

  fs.ensureDirSync(docsetDirectory);
  await extract({
    file: tempPath,
    cwd: docsetDirectory,
    strip: 1,
  });

  fs.removeSync(tempPath);
}
