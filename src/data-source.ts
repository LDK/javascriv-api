import "reflect-metadata"
import { DataSource } from "typeorm"
import { User } from "./entity/User"
import { File } from "./entity/File";
import { Project } from "./entity/Project";

import * as dotenv from 'dotenv';
dotenv.config({ path: __dirname + '/../.env' });

export const AppDataSource = new DataSource({
    type: "postgres",
    host: process.env.DB_HOST,
    port: process.env.DB_PORT as unknown as number,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    synchronize: false,
    logging: false,
    entities: [User, File, Project],
    migrations: [],
    subscribers: [],
})
