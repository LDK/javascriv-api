import { Router } from 'express';
import { User } from '../entity/User';
import bcrypt from 'bcrypt';
import { getDataSource } from '../database';
import jwt from 'jsonwebtoken';
import Mailgun from 'mailgun-js';
import { QueryFailedError } from 'typeorm';
import { expressjwt, Params, Request as JWTRequest } from "express-jwt";
import { EditorFont } from '../components/javascriv-types/Editor/EditorFonts';

const jwtProps:Params = { secret: process.env.SECRET_KEY as string, algorithms: ["HS256"] };

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

  const existingUser = await userRepository.findOne({ where: { username }, select: ["id", "username", "passwordHash", "email", "publishOptions"] });

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

type UserPublishingOptions = { [key: string]: string | number | boolean };
type UserFontOptions = { [key: string]: EditorFont | number };

const maxUsernameLength = 20;

type UserPatch = {
  username?: string;
  publishOptions?: UserPublishingOptions;
  fontOptions?: UserFontOptions;
  newPassword?: string;
  newPasswordConfirm?: string;
  email?: string;
};

router.patch('/user', expressjwt(jwtProps), async (req: JWTRequest, res) => {
  /**
   * User id is taken from the JWT token, as users can only edit their own profile.
   * req.body should be an instance of UserPatch
   */

  const token = req.headers.authorization?.replace('Bearer ', '');

  try {
    jwt.verify(token || '', process.env.SECRET_KEY || ''); 
  } catch (err) {
    return res.status(401).send('Invalid token');
  }

  try {
    const dataSource = await getDataSource();
    const userRepository = dataSource.getRepository(User);

    const user = await userRepository.findOne(
      { 
        select: ['id', 'username', 'email', 'publishOptions', 'fontOptions'],
        where: { id: req.auth?.id } 
      });

    console.log('user', user, req.auth?.id);

    if (!user || user.id !== req.auth?.id) {
      return res.status(404).send('User not found.');
    }

    const checkIsEmail = (str: string) => {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
    }
    
    const { username, publishOptions, fontOptions, newPassword, newPasswordConfirm, email } = req.body as UserPatch;

    if (!username && !publishOptions && !newPassword && !newPasswordConfirm && !email && !fontOptions) {
      return res.status(400).send('No information sent.');
    }

    const updates:string[] = [];

    if (username && username !== user.username) {
      // Check if username is already taken
      const existingUsername = await userRepository.findOne({ where: { username } });

      if (existingUsername) {
        return res.status(409).send('Username is already taken.');
      }

      // Check username length
      if (username.length > maxUsernameLength) {
        return res.status(400).send(`Username cannot be longer than ${maxUsernameLength} characters.`);
      }

      // Check if username is an email address.  If so, it will be exempt from the alphanumeric check.
      const isEmail = checkIsEmail(username);

      // Only allow alphanumeric characters, dashes, underscores, periods and spaces, unless it is an email address
      if (!/^[a-zA-Z0-9-_ .]+$/.test(username) && !isEmail) {
        return res.status(400).send('Username can only contain alphanumeric characters, dashes, underscores, periods and spaces.');
      }

      updates.push(`New username: ${username}`);
      user.username = username;
    }

    if (email && email !== user.email) {
      // Check if email is already taken
      const existingEmail = await userRepository.findOne({ where: { email } });

      if (existingEmail) {
        return res.status(409).send('E-mail address is already in use.');
      }

      // Check if email address is valid
      if (!checkIsEmail(email)) {
        return res.status(400).send('Invalid e-mail address.');
      }

      updates.push(`New e-mail address: ${email}`);
      user.email = email;
    }

    if (publishOptions) {
      user.publishOptions = publishOptions;
    }

    if (fontOptions) {
      user.fontOptions = fontOptions;
    }

    if (newPassword) {
      if (!newPasswordConfirm) {
        return res.status(400).send('Missing password confirmation.');
      }

      if (newPassword !== newPasswordConfirm) {
        return res.status(400).send('New password and confirmation do not match.');
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);

      updates.push('Password changed.');
      user.passwordHash = passwordHash;
    }

    await userRepository.save(user);

    return res.status(200).send({
      id: user.id,
      username: user.username,
      email: user.email,
      publishOptions: user.publishOptions,
      fontOptions: user.fontOptions,
        // Signing a JWT using the secret key from the environment variables
      token: jwt.sign({ id: user.id, username: user.username }, process.env.SECRET_KEY as string, { expiresIn: '720h' })
    });

  } catch (error) {
    if (error instanceof QueryFailedError) {
      return res.status(500).send(`Database Query Failed: ${error.message}`);
    } else if (error instanceof Error) {
      return res.status(400).send(error.message);
    }
  }
});

export default router;
