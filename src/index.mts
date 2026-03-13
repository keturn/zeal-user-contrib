import path from 'node:path';
import { stdout } from 'node:process';
import url from 'node:url';
import { Command, Option } from 'commander';
import search, { Separator } from '@inquirer/search';
import fs from 'fs-extra';
import { table, getBorderCharacters } from 'table';
import { Docset, downloadDocset, extractDocset, getAvailableDocsets } from './docsets.mjs';
import { saveIcons } from './icons.mjs';
import { logger } from './logger.mjs';
import { availableMirrors, getMetadata, saveMetadata } from './metadata.mjs';
import { getDocsetsDirectory } from './zeal.mjs';
import { escapeRegExp } from 'es-toolkit/string';

function getVersion(): string {
  const currentDirectory = path.dirname(url.fileURLToPath(import.meta.url));
  const packageJsonPath = path.resolve(currentDirectory, '../package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString());
  return packageJson.version;
}

// inquirer's function signatures are quirky enough to need a little type hinting, but it doesn't
// export the Choice type.
type SearchSourceFn<V> = Parameters<typeof search<V>>[0]['source'];
type SearchResults<V> = Awaited<ReturnType<SearchSourceFn<V>>>;
type Choice<Value> = Extract<SearchResults<Value>[number], { value: Value }>;

async function selectDocset(mirror?: string): Promise<Docset> {
  const availableDocsets = await getAvailableDocsets(mirror);

  const alphaCompare = Intl.Collator('en', { sensitivity: 'accent' }).compare;
  const choices: Choice<Docset>[] = availableDocsets
    .map(docset => ({
      name: docset.name,
      description: `${docset.name} ${docset.aliases?.length > 0 ? `[${docset.aliases.join(', ')}]` : ''}`,
      value: docset,
    }))
    .sort((a, b) => alphaCompare(a.name, b.name));

  const selected = await search({
    message: 'Select a docset to add to Zeal',
    pageSize: Math.max(3, stdout.rows - 5),
    source: (term: string | void) => {
      if (!term) {
        return choices;
      }
      const matcher = new RegExp(escapeRegExp(term), 'iu');
      let matches = choices.map(choice => ({
        nameMatch: matcher.test(choice.name) || matcher.test(choice.value.id),
        aliasMatch: choice.value.aliases?.some(alias => matcher.test(alias)) ?? false,
        name: choice.name,
        choice: choice as Choice<Docset> | Separator,
      }));
      matches = matches.filter(({ nameMatch, aliasMatch }) => nameMatch || aliasMatch);
      // Docs that match the name get sorted above those that only match an alias.
      matches.unshift({ nameMatch: false, aliasMatch: true, name: 'Aliases', choice: new Separator() });
      // Sort is stable, so we don't have to re-alphabetize every time.
      matches.sort((a, b) => (a.nameMatch ? 0 : 1) - (b.nameMatch ? 0 : 1));
      if (matches.at(-1)?.choice instanceof Separator) {
        matches.pop();
      }
      return matches.map(({ choice }) => choice);
    },
  });

  return selected;
}

async function listAllDocsets(mirror?: string): Promise<void> {
  const availableDocsets = await getAvailableDocsets(mirror);
  const docsetsTable = [['Name', 'ID']];
  availableDocsets
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
    .forEach(docset => docsetsTable.push([docset.name, docset.id]));

  const output = table(docsetsTable, {
    border: getBorderCharacters('void'),
    columnDefault: {
      paddingLeft: 0,
      paddingRight: 1,
    },
    singleLine: true,
    drawHorizontalLine: () => false,
  });

  console.log(output.trim());
}

async function runWithOptions(options: any): Promise<void> {
  let docsetsDirectory: string = options.outputDirectory;
  if (docsetsDirectory === undefined) {
    docsetsDirectory = await getDocsetsDirectory();
  }

  if (options.listAll) {
    await listAllDocsets();
    return;
  }

  let docsetsToInstall: Docset[] = [];

  if (options.install) {
    const availableDocsets = await getAvailableDocsets(options.mirror);
    docsetsToInstall = availableDocsets.filter(docset => options.install.includes(docset.id));
  } else {
    const docset = await selectDocset(options.mirror);
    docsetsToInstall = [docset];
  }

  const tasks = docsetsToInstall.map(async docset => {
    const docsetDirectory = path.resolve(docsetsDirectory, `${docset.id}.docset`);

    if (fs.existsSync(docsetDirectory)) {
      if (!options.force) {
        throw new Error(`${docsetDirectory} already exists, use --force to overwrite it`);
      }

      logger.warn(`Removing existing docset at ${docsetDirectory}`);
      fs.removeSync(docsetDirectory);
    }

    const metadata = getMetadata(docset, options.mirror);

    const tempPath = await downloadDocset(docset, metadata, docsetsToInstall.length === 1);
    await extractDocset(tempPath, docsetDirectory);
    saveIcons(docset, docsetDirectory);
    saveMetadata(metadata, docsetDirectory);

    logger.success(`Successfully added the ${docset.name} docset to Zeal`);
  });

  await Promise.allSettled(tasks);

  logger.info('If Zeal is running, make sure to restart it for the docset to show up');
}

export async function run(): Promise<void> {
  const program = new Command()
    .name('zeal-user-contrib')
    .version(getVersion())
    .addOption(
      new Option('-m, --mirror <mirror>', 'the mirror to use, by default a random one is chosen').choices(
        availableMirrors,
      ),
    )
    .option('-l, --list-all', 'List all available docsets without a pager')
    .option('-o, --output-directory <path>', "path to Zeal's docsets directory, overriding the default search for it")
    .option('-i, --install <ids...>', 'Install packages for the provided IDs')
    .option('-f, --force', 'overwrite existing docsets')
    .parse(process.argv);

  runWithOptions(program.opts()).catch((err: Error) => {
    logger.error(err.message);
    process.exit(1);
  });
}
