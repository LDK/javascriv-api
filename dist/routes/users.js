"use strict";
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
router.post('/user/register', async (req, res) => {
    const { username, password, email } = req.body;
    if (!username || !password || !email) {
        return res.status(400).send('Missing username, e-mail or password');
    }
    // Get the User Repository from the DataSource
    const dataSource = await (0, database_1.getDataSource)();
    const userRepository = dataSource.getRepository(User_1.User);
    const existingUsername = await userRepository.findOne({ where: { username } });
    if (existingUsername) {
        return res.status(409).send('Username is already taken.');
    }
    const existingEmail = await userRepository.findOne({ where: { email } });
    if (existingEmail) {
        return res.status(409).send('E-mail is already in use.');
    }
    const passwordHash = await bcrypt_1.default.hash(password, 10);
    const user = userRepository.create({ username, email, passwordHash });
    await userRepository.save(user);
    const { passwordHash: hash } = user, newUser = __rest(user, ["passwordHash"]);
    // Signing a JWT using the secret key from the environment variables
    const token = jsonwebtoken_1.default.sign({ id: newUser.id, username: newUser.username }, process.env.SECRET_KEY, { expiresIn: '720h' });
    return res.status(201).send(Object.assign(Object.assign({}, newUser), { token }));
});
router.post('/user/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).send('Missing username or password');
    }
    const dataSource = await (0, database_1.getDataSource)();
    const userRepository = dataSource.getRepository(User_1.User);
    const existingUser = await userRepository.findOne({ where: { username } });
    if (!existingUser) {
        return res.status(401).send('Invalid username or password');
    }
    const passwordMatch = await bcrypt_1.default.compare(password, existingUser.passwordHash);
    if (!passwordMatch) {
        return res.status(401).send('Invalid username or password');
    }
    // Signing a JWT using the secret key from the environment variables
    const token = jsonwebtoken_1.default.sign({ id: existingUser.id, username: existingUser.username }, process.env.SECRET_KEY, { expiresIn: '720h' });
    // Return user data and token
    const { passwordHash } = existingUser, user = __rest(existingUser, ["passwordHash"]);
    return res.status(200).json(Object.assign(Object.assign({}, user), { token }));
});
exports.default = router;
