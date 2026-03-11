import fs from 'fs-extra';
import ky from 'ky';
import * as tar from 'tar';
import { logger } from "./logger.mts";
import { Metadata } from "./metadata.mts";
import { sample } from "@es-toolkit/es-toolkit";
import { ProgressByteStream } from "./streams.ts";

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
  let url: string;
  if (mirror === "FAKE") {
    url = 'file:///tmp/zzz-contribs.json';  // cspell:disable-line
  } else {
    mirror = mirror !== undefined ? mirror + '.' : '';

    url = `https://${mirror}kapeli.com/feeds/zzz/user_contributed/build/index.json`;  
  }
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
  const tempPath = await Deno.makeTempFile({ prefix: docset.name, suffix: '.tar.gz' });
  // By default a random url is chosen, just like how Zeal would download a docset
  // If a mirror is specified with --mirror, metadata.urls will only contain one url
  let archiveUrl = sample(metadata.urls);

  if (/FAKE/.test(archiveUrl)) {
    archiveUrl = 'file:///tmp/fake-attrs.tgz';  // cspell:disable-line
  }

  logger.info(`Downloading docset from ${archiveUrl}`);

  const resp = await fetch(archiveUrl);
  const body = resp.body;
  let readable = body;

  if (showProgress) {
    const bar = logger.progress();

    readable = readable.pipeThrough(ProgressByteStream.fromResponse(resp, ({percent}) => {
      bar.update(percent);
    }));
  }

  await Deno.writeFile(tempPath, readable);
  return tempPath;
}

export async function extractDocset(tempPath: string, docsetDirectory: string): Promise<void> {
  logger.info(`Extracting docset to ${docsetDirectory}`);

  fs.ensureDirSync(docsetDirectory);
  await tar.extract({
    file: tempPath,
    cwd: docsetDirectory,
    strip: 1,
  });

  fs.removeSync(tempPath);
}
