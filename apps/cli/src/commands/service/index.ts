import { Command } from 'commander'
import { installCommand } from './install.js'
import { configureCommand } from './configure.js'
import { daemonCommand } from './daemon.js'
import { startCommand, stopCommand, restartCommand, statusCommand, checkCommand, uninstallServiceCommand } from './control.js'

export const serviceCommand = new Command('service')
  .description('Manage the SSL Pilot auto-renewal background service')
  .addHelpText('after', `
Commands:
  install      Interactive setup — writes config, hooks, and installs systemd unit
  configure    Update watch domains, interval, thresholds — restarts service
  start        Start the service        (requires sudo)
  stop         Stop the service         (requires sudo)
  restart      Restart — picks up /etc/ssl-pilot/config.json changes (requires sudo)
  status       Show service status
  check        Run one renewal cycle immediately (requires sudo)
  uninstall    Remove the systemd unit (config and certs are kept) (requires sudo)

Examples:
  sudo sp service install
  sudo sp service configure
  sudo sp service restart
  sp service status
  journalctl -u ssl-pilot -f
`)

serviceCommand.addCommand(installCommand)
serviceCommand.addCommand(configureCommand)
serviceCommand.addCommand(startCommand)
serviceCommand.addCommand(stopCommand)
serviceCommand.addCommand(restartCommand)
serviceCommand.addCommand(statusCommand)
serviceCommand.addCommand(checkCommand)
serviceCommand.addCommand(uninstallServiceCommand)
serviceCommand.addCommand(daemonCommand, { hidden: true })
