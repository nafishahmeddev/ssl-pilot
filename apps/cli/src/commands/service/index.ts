import { Command } from 'commander'
import { installCommand } from './install.js'
import { daemonCommand } from './daemon.js'
import { startCommand, stopCommand, statusCommand, checkCommand, uninstallServiceCommand } from './control.js'

export const serviceCommand = new Command('service')
  .description('Manage the SSL Pilot auto-renewal background service')
  .addHelpText('after', `
Commands:
  install    Interactive setup — writes config, hooks, and installs systemd unit
  start      Start the service       (requires sudo)
  stop       Stop the service        (requires sudo)
  status     Show service status
  check      Run one renewal cycle immediately, useful for testing  (requires sudo)
  uninstall  Remove the systemd unit (config and certs are kept)   (requires sudo)

Examples:
  sudo sp service install
  sp service status
  journalctl -u ssl-pilot -f
`)

serviceCommand.addCommand(installCommand)
serviceCommand.addCommand(startCommand)
serviceCommand.addCommand(stopCommand)
serviceCommand.addCommand(statusCommand)
serviceCommand.addCommand(checkCommand)
serviceCommand.addCommand(uninstallServiceCommand)
serviceCommand.addCommand(daemonCommand, { hidden: true })
