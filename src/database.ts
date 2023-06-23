import { DataSource } from 'typeorm';
import { User } from './entity/User';

let dataSource: DataSource | null = null;

export const getDataSource = async () => {
  if (!dataSource) {
    let databaseUrl = process.env.DATABASE_URL;
    let useSSL = false;
    if (!databaseUrl) {
      databaseUrl = `postgres://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`;
    } else {
      useSSL = true;
    }

    dataSource = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      entities: [
        "src/entity/**/*.ts"
      ],
      synchronize: true,
      ssl: useSSL ? {
        rejectUnauthorized: false,
      } : undefined,
      extra: useSSL ? {
        ssl: {
          rejectUnauthorized: false,
        },
      } : undefined,
    });

    await dataSource.initialize();
  }

  return dataSource;
}
