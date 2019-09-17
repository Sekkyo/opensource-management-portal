//
// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.
//

'use strict';

import { IEntityMetadataProvider } from './entityMetadataProvider';
import { ITableEntityMetadataProviderOptions, TableEntityMetadataProvider } from './table';
import { IPostgresEntityMetadataProviderOptions, PostgresEntityMetadataProvider } from './postgres';
import { MemoryEntityMetadataProvider } from './memory';

const providerTypes = [
  'memory',
  'table',
  'postgres',
];

const defaultProviderName = 'memory'; // if provider not configured, use in-memory database

export interface IEntityMetadataProvidersOptions {
  tableOptions?: ITableEntityMetadataProviderOptions;
  postgresOptions?: IPostgresEntityMetadataProviderOptions;
  providerTypeName?: string;
}

export async function createAndInitializeEntityMetadataProviderInstance(app, config, options: IEntityMetadataProvidersOptions, overrideProviderType?: string): Promise<IEntityMetadataProvider> {
  if (overrideProviderType) {
    options.providerTypeName = overrideProviderType;
  }
  const provider = createEntityMetadataProviderInstance(options);
  await provider.initialize();
  return provider;
}

export function createEntityMetadataProviderInstance(options: IEntityMetadataProvidersOptions): IEntityMetadataProvider {
  const providerName = options.providerTypeName || defaultProviderName; // config.github.approvals.provider.name
  switch(providerName) {
    case 'memory':
      return new MemoryEntityMetadataProvider();

    case 'postgres':
      return new PostgresEntityMetadataProvider(options.postgresOptions);

    case 'table':
      return new TableEntityMetadataProvider(options.tableOptions);

    default:
      throw new Error(`${providerName} EntityMetadataProvider not implemented`);
  }
};
