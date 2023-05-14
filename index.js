const { Command } = require('commander')

const {
  byUrl,
  byDocId,
  login,
  createDir,
  byLibraryId,
  ConvertAndStoreData
} = require('./util/index')

const program = new Command()

program
  .command('login')
  .description('登录login账号')
  .action(async () => {
    await login()
  })

program
  .command('output')
  .description('the output directory of md')
  .action(async () => {
    await createDir()
  })

program
  .command('libraryId <libraryId>')
  .description('The ID of iknow libraryId')
  .action(async (libraryId) => {
    await byLibraryId(libraryId)
  })

program
  .command('url <source>')
  .description('The URL of iknow document')
  .action(async (source) => {
    await ConvertAndStoreData(await byUrl(source))
  })

program
  .command('id <ID>')
  .description('The ID of iknow document')
  .action(async (ID) => {
    await ConvertAndStoreData(await byDocId(ID))
  })

async function main(argv) {
  await program.parseAsync(process.argv)
}

module.exports.run = main
