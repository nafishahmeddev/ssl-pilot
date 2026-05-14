#!/usr/bin/env node
import { Command } from 'commander'
import { listCommand } from './commands/list.js'
import { downloadCommand } from './commands/download.js'
import { serviceCommand } from './commands/service/index.js'

const program = new Command()
  .name('sp')
  .description('SSL Pilot CLI — manage and auto-renew your SSL certificates')
  .version('1.0.0')
  .addHelpText('after', `
Examples:
  sp list                          List all certificates
  sudo sp download                 Pick and download interactively
  sudo sp download '*.example.com' Download a specific domain
  sudo sp service install          Set up the auto-renewal service
  sp service status                Check service status

Documentation:
  https://github.com/nafishahmeddev/ssl-pilot/blob/main/apps/cli/SETUP.md
`)

program.addCommand(listCommand)
program.addCommand(downloadCommand)
program.addCommand(serviceCommand)

program.action(() => program.outputHelp())

program.parse()
