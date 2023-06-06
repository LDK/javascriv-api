import { DataSource } from 'typeorm';
import { User } from './entity/User';

let dataSource: DataSource | null = null;

export const getDataSource = async () => {
  if (!dataSource) {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      entities: [
        "src/entity/**/*.ts"
      ],
      synchronize: true,
    });

    await dataSource.initialize();
  }

  return dataSource;
}
