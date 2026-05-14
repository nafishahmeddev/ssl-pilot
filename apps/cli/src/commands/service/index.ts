import { Command } from 'commander'
import { installCommand } from './install.js'
import { daemonCommand } from './daemon.js'
import { startCommand, stopCommand, statusCommand, checkCommand, uninstallServiceCommand } from './control.js'

export const serviceCommand = new Command('service')
  .description('Manage the SSL Pilot background service')

serviceCommand.addCommand(installCommand)
serviceCommand.addCommand(startCommand)
serviceCommand.addCommand(stopCommand)
serviceCommand.addCommand(statusCommand)
serviceCommand.addCommand(checkCommand)
serviceCommand.addCommand(uninstallServiceCommand)
serviceCommand.addCommand(daemonCommand, { hidden: true })
