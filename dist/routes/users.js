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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const User_1 = require("../entity/User");
const bcrypt_1 = __importDefault(require("bcrypt"));
const database_1 = require("../database");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const router = (0, express_1.Router)();
router.post('/user/register', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { username, password, email } = req.body;
    if (!username || !password || !email) {
        return res.status(400).send('Missing username, e-mail or password');
    }
    // Get the User Repository from the DataSource
    const dataSource = yield (0, database_1.getDataSource)();
    const userRepository = dataSource.getRepository(User_1.User);
    const existingUsername = yield userRepository.findOne({ where: { username } });
    if (existingUsername) {
        return res.status(409).send('Username is already taken.');
    }
    const existingEmail = yield userRepository.findOne({ where: { email } });
    if (existingEmail) {
        return res.status(409).send('E-mail is already in use.');
    }
    const passwordHash = yield bcrypt_1.default.hash(password, 10);
    const user = userRepository.create({ username, email, passwordHash });
    yield userRepository.save(user);
    const { passwordHash: hash } = user, newUser = __rest(user, ["passwordHash"]);
    // Signing a JWT using the secret key from the environment variables
    const token = jsonwebtoken_1.default.sign({ id: newUser.id, username: newUser.username }, process.env.SECRET_KEY, { expiresIn: '720h' });
    return res.status(201).send(Object.assign(Object.assign({}, newUser), { token }));
}));
router.post('/user/login', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).send('Missing username or password');
    }
    const dataSource = yield (0, database_1.getDataSource)();
    const userRepository = dataSource.getRepository(User_1.User);
    const existingUser = yield userRepository.findOne({ where: { username } });
    if (!existingUser) {
        return res.status(401).send('Invalid username or password');
    }
    const passwordMatch = yield bcrypt_1.default.compare(password, existingUser.passwordHash);
    if (!passwordMatch) {
        return res.status(401).send('Invalid username or password');
    }
    // Signing a JWT using the secret key from the environment variables
    const token = jsonwebtoken_1.default.sign({ id: existingUser.id, username: existingUser.username }, process.env.SECRET_KEY, { expiresIn: '720h' });
    // Return user data and token
    const { passwordHash } = existingUser, user = __rest(existingUser, ["passwordHash"]);
    return res.status(200).json(Object.assign(Object.assign({}, user), { token }));
}));
exports.default = router;
