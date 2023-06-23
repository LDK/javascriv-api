"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDataSource = void 0;
const typeorm_1 = require("typeorm");
const User_1 = require("./entity/User");
const Project_1 = require("./entity/Project");
const File_1 = require("./entity/File");
let dataSource = null;
const getDataSource = () => __awaiter(void 0, void 0, void 0, function* () {
    if (!dataSource) {
        let databaseUrl = process.env.DATABASE_URL;
        let useSSL = false;
        if (!databaseUrl) {
            databaseUrl = `postgres://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`;
        }
        else {
            useSSL = true;
        }
        dataSource = new typeorm_1.DataSource({
            type: 'postgres',
            url: databaseUrl,
            entities: [User_1.User, Project_1.Project, File_1.File],
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
        yield dataSource.initialize();
    }
    return dataSource;
});
exports.getDataSource = getDataSource;
