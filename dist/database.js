"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDataSource = void 0;
const typeorm_1 = require("typeorm");
let dataSource = null;
const getDataSource = async () => {
    console.log('process env', process.env);
    if (!dataSource) {
        let databaseUrl = process.env.DATABASE_URL;
        // if (!databaseUrl) {
        //   databaseUrl = `postgres://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`;
        // }
        dataSource = new typeorm_1.DataSource({
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
};
exports.getDataSource = getDataSource;
