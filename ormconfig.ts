import { DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config({ path: __dirname + '/.env' });

console.log('process.env', process.env);

const config: DataSourceOptions = {
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [
     'src/entity/**/*.ts'   // Adjust this if your entities are located elsewhere.
  ],
  synchronize: false,
  logging: false,
  migrations: [
     'src/migration/**/*.ts'   // Adjust this if your migrations are located elsewhere.
  ],
  subscribers: [
     'src/subscriber/**/*.ts'  // Adjust this if your subscribers are located elsewhere.
  ],
};

export = config;
