#!/usr/bin/env node
import { Command } from 'commander'
import { listCommand } from './commands/list.js'
import { downloadCommand } from './commands/download.js'

const program = new Command()
  .name('sp')
  .description('SSL Pilot CLI — download and manage your SSL certificates')
  .version('1.0.0')

program.addCommand(listCommand)
program.addCommand(downloadCommand)

program.parse()
