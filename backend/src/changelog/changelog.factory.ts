import { Logger } from '@nestjs/common';
import { ChangelogProvider } from './changelog.provider';
import { GithubAppProvider } from './github-app.provider';
import { MockChangelogProvider } from './mock-changelog.provider';

// Kept apart from the module for the same reason as summarizer.factory.ts:
// provider selection is testable without loading Nest.

export interface ChangelogSettings {
  provider?: 'mock' | 'github';
  appId?: string;
  installationId?: string;
  privateKey?: string;
}

/**
 * - provider "mock" -> mock, even with credentials
 * - any credential missing or blank -> mock, with a warning
 * - otherwise -> the GitHub App
 */
export function createChangelogProvider(
  settings: ChangelogSettings,
  logger: Pick<Logger, 'log' | 'warn'> = new Logger('Changelog'),
): ChangelogProvider {
  if (settings.provider === 'mock') {
    logger.log('Active changelog provider: mock (CHANGELOG_PROVIDER=mock)');
    return new MockChangelogProvider();
  }

  const appId = settings.appId?.trim() ?? '';
  const installationId = settings.installationId?.trim() ?? '';
  const privateKey = settings.privateKey?.trim() ?? '';
  if (!appId || !installationId || !privateKey) {
    logger.warn(
      'GitHub App credentials incomplete. Active changelog provider: mock',
    );
    return new MockChangelogProvider();
  }

  logger.log('Active changelog provider: github');
  return new GithubAppProvider({ appId, installationId, privateKey });
}
