import 'reflect-metadata';
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { getDataSource } from './database';
import userRoutes from './routes/users';
import projectRoutes from './routes/projects';

// Get connection to DB
const dataSource = getDataSource();

// Once the connection is established, we initialize the Express app
dataSource.then(() => {
  const app = express();

  var allowedOrigins = process.env.DB_ALLOWED_ORIGINS
  ? process.env.DB_ALLOWED_ORIGINS.split(',')
  : [];

  console.log("Allowed origins: ", allowedOrigins)

  app.use(cors({
    origin: function(origin, callback){
      // allow requests with no origin 
      // (like mobile apps or curl requests)
      if(!origin) return callback(null, true);
      if(allowedOrigins.indexOf(origin) === -1){
        var msg = 'The CORS policy for this site does not ' +
                  'allow access from the specified Origin.';
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type']
  }));

  app.use(express.json()); // for parsing application/json
  app.use('/', userRoutes);
  app.use('/', projectRoutes);

  // Heroku will add the port to the environment variables
  // If it doesn't exist, default to 4000 for local development
  const port = process.env.PORT || 4000;

  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}).catch((error:any) => console.log("Error: ", error));
