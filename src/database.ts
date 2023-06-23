import { DataSource } from 'typeorm';

let dataSource: DataSource | null = null;

export const getDataSource = async () => {

  console.log('process env', process.env);

  if (!dataSource) {
    let databaseUrl = process.env.DATABASE_URL;

    console.log('database url, try 1', databaseUrl);

    if (!databaseUrl) {
      databaseUrl = `postgres://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`;
    }

    console.log('database url, try 2', databaseUrl);

    dataSource = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      entities: [
        "src/entity/**/*.ts"
      ],
      synchronize: true,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      extra: {
        ssl: process.env.NODE_ENV === 'production' ? true : false
      }
    });

    await dataSource.initialize();
  }

  return dataSource;
}
