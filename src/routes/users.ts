import { Router } from 'express';
import { User } from '../entity/User';
import bcrypt from 'bcrypt';
import { getDataSource } from '../database';
import jwt from 'jsonwebtoken';
import Mailgun from 'mailgun-js';

const router = Router();

router.post('/user/register', async (req, res) => {
  const { username, password, email } = req.body;

  if (!username || !password || !email) {
    return res.status(400).send('Missing username, e-mail or password');
  }

  if (username.includes('@')) {
    return res.status(400).send('Username cannot contain @ symbol.');
  }

  // Get the User Repository from the DataSource
  const dataSource = await getDataSource();
  const userRepository = dataSource.getRepository(User);

  const existingUsername = await userRepository.findOne({ where: { username } });

  if (existingUsername) {
    return res.status(409).send('Username is already taken.');
  }

  const existingEmail = await userRepository.findOne({ where: { email } });

  if (existingEmail) {
    return res.status(409).send('E-mail is already in use.');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user:User = userRepository.create({ username, email, passwordHash });

  await userRepository.save(user);

  const { passwordHash: hash, ...newUser } = user;

  // Signing a JWT using the secret key from the environment variables
  const token = jwt.sign({ id: newUser.id, username: newUser.username }, process.env.SECRET_KEY as string, { expiresIn: '720h' });

  const mailService = process.env.MAIL_SERVICE as string;

  switch (mailService) {
    case 'mailgun':
      // Initialize mailgun
      const mailgun = Mailgun({ apiKey: process.env.MAILGUN_API_KEY as string, domain: process.env.MAILGUN_DOMAIN as string });

      const data = {
        from: 'javaScriv <lemondropkid@gmail.com>',
        to: email,
        subject: 'Welcome to Our App',
        text: 'Thank you for registering at our app. We are glad to have you!'
      };
    
      mailgun.messages().send(data, (error, body) => {
        if (error) {
          console.error('Failed to send email', error);
        } else {
          console.log('Email sent', body);
        }
      });
    
    break;

    case 'postmark':
      // Initialize postmark
      // Require:
      var postmark = require("postmark");

      // Send an email:
      var client = new postmark.ServerClient(process.env.POSTMARK_API_KEY as string);

      client.sendEmail({
        "From": "javaScriv@electric-bungalow.com",
        "To": email,
        "Subject": "Welcome to javaScriv!  Verify your account.",
        "HtmlBody": "<strong>Hello</strong> dear Postmark user.",
        "TextBody": "Hello from Postmark!",
        "MessageStream": "outbound"
      });

    break;
  }

  return res.status(201).send({...newUser, token});
});

router.post('/user/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).send('Missing username or password');
  }

  const dataSource = await getDataSource();
  const userRepository = dataSource.getRepository(User);

  const existingUser = await userRepository.findOne({ where: { username }, select: ["id", "username", "passwordHash", "email"] });

  if (!existingUser) {
    return res.status(401).send('Invalid username or password');
  }

  const passwordMatch = await bcrypt.compare(password, existingUser.passwordHash);

  if (!passwordMatch) {
    return res.status(401).send('Invalid username or password');
  }

  // Signing a JWT using the secret key from the environment variables
  const token = jwt.sign({ id: existingUser.id, username: existingUser.username }, process.env.SECRET_KEY as string, { expiresIn: '720h' });

  // Return user data and token
  const { passwordHash, ...user } = existingUser;
  
  return res.status(200).json({ ...user, token });
});

export default router;
