import {spawnSync} from 'child_process'
import path, {join} from 'path'
import _ from 'lodash'
import pkgConf from 'pkg-conf'
import exit from 'exit'
import Debug from 'debug'
const debug = Debug('dimsim-docker-cli')
import indentString from 'indent-string'
import Yargs from 'yargs'
import untildify from 'untildify'
import toSpawnArgs from 'object-to-spawn-args'

//
// To debug:
//
// DEBUG=* dimsim-docker --docker.dimsim-src=~/dev-live/dimsim --docker.shell
//

export default function() {

  // TODO(vjpr): Check that Docker for Windows is installed. Offer to open
  //   browser to install page.

  let runDockerShell = false

  const yargs = Yargs
    .usage('Usage: $0 <command> [options]')
    .command('docker-shell', 'Open /bin/bash in the Docker container for debugging.', (yargs) => {
      runDockerShell = true
    })
    .command('docker-clean', 'Open /bin/bash in the Docker container for debugging.', (yargs) => {
      // TODO(vjpr): Figure out a cross-platform command.
      const cmd = 'docker rm -f $(docker ps -a -q)'
      console.log('Run:', cmd)
      exit()
    })
    .describe('docker.debug', 'Enable debug logging inside the container.')
    .describe('docker.dimsim-src', 'Path to the dimsim working dir for use during dimsim development.')
    .describe('help', 'Show dimsim-docker-cli and dimsim help.')
  const argv = yargs.parse(process.argv)

  const dockerOpts = argv.docker || {}

  console.log({argv})

  if (argv.help || argv._.length <= 2) {
    console.log('='.repeat(80))
    console.log('Docker Wrapper (dimsim-docker-cli) Help\n')
    yargs.showHelp()
    console.log('='.repeat(80))
  }

  const config = getConfig()

  const image = getDockerImage(config)
  if (!image) return

  const cmd = 'docker'

  let cmdToRun = process.argv.slice(2)

  //let flags = {
  //  interactive: true,
  //  tty: true,
  //  rm: true,
  //  // This is used for mapping the real path.
  //  env: 'DIMSIM_CODE_HOST_PWD=$PWD'
  //}

  let flagsStr = [
    '--interactive --tty --rm',
    // This is used for mapping the real path.
    '--env DIMSIM_CODE_HOST_PWD=$PWD',
    '--volume $PWD:/code',
    '--volume /var/run/docker.sock:/var/run/docker.sock',
    '--volume /tmp/dimsim:/tmp/dimsim',
  ]

  // Whilst developing dimsim we must point to our dev dimsim repo.
  let dimsimSrc = dockerOpts['dimsim-src'] || process.env.DIMSIM_SRC
  dimsimSrc = untildify(dimsimSrc)
  if (dimsimSrc) {
    flagsStr = flagsStr.concat([
      `--volume ${dimsimSrc}:/home/app/current`,
      `--volume dimsim-node_modules:/home/app/current/node_modules`,
    ])
  }

  if (runDockerShell) {
    flagsStr.push('--entrypoint=/bin/bash')
    cmdToRun = null
  }

  let argsStr = [
    'run',
    flagsStr,
    image,
    cmdToRun,
  ]

  let args = _(argsStr).castArray().flatten().value().join(' ')
    .replace(/\s\s+/g, ' ').split(' ').filter(Boolean)

  let fullCmdStr = `${cmd} ${args.join(' ')}`

  debug('full cmd str:', fullCmdStr)

  args = args.map(replaceEnvVars)

  debug('spawn cmd:', cmd)
  debug('spawn args:', args)

  const proc = spawnSync(cmd, args, {
    stdio: 'inherit',
    detached: true,
  })

}

function getConfig() {
  return pkgConf.sync('dimsim', {
    defaults: {
      image: null,
    }
  })
}

function getDockerImage(config) {
  if (config.image) return config.image
  console.log('You must specify an image in your package.json file or using the --image flag.')
  return
}

function replaceEnvVars(str) {
  const replaced = str.replace(/\$(\w+)/g, (_, match) => {
    return process.env[match]
  })
  return replaced
}