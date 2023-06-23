"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRepository = void 0;
const database_1 = require("../database");
const User_1 = require("../entity/User");
const dataSource = (0, database_1.getDataSource)();
exports.UserRepository = dataSource.then(ds => ds.getRepository(User_1.User).extend({
    findByName(name) {
        return this.findOne({ where: { username: name } });
    }
}));
