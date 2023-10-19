import dotenv from 'dotenv';
import express from 'express';
import MongoStore from 'connect-mongo';
import { MongoClient } from 'mongodb';
import { URLSearchParams, fileURLToPath } from 'url';
import { dirname } from 'path';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import path from 'path';
import compression from 'compression';

dotenv.config({path: './config.env'});
export const app = express();

// Convert import.meta.url to a file path
const currentFilePath = fileURLToPath(import.meta.url);
const currentDirName = dirname(currentFilePath);
const publicDirPath = path.join(currentDirName, 'public');

// Logger middleware (before session)
app.use(morgan('dev'));

// Static files middleware
app.use(express.static(publicDirPath, { index: 'index.ejs' }));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Compression middleware
app.use(compression());

// Cookie parsing middleware
app.use(cookieParser());

// Session middleware
app.use(
    session({
        name: 'user-sesh.sid',
        secret: 'secret',
        secure: true,
        maxAge: 1000 * 60 * 60 * 1,
        resave: false,
        saveUninitialized: true,
        store: MongoStore.create({ mongoUrl: process.env.MONGODB_CONN_URI })
    })
);

// View rendering middleware (using EJS)
app.set('view engine', 'ejs');


// Custom timeout middleware
app.use(function (request, response, next) {
    const currentTime = Date.now();

    if (request.session.sessionTimeout && currentTime > request.session.sessionTimeout) {
        // Session has timed out
        // Clear the session and log the user out
        request.session.destroy(function (err) {
            if (err) {
                console.error('Error destroying the session:', err);
            }
            response.redirect('/');
        });
    }
    next();
});

app.get('/', function (request, response) {
    response.render('index');
});

app.post('/auth', async function (request, response) {
    const username = request.body.userId;
    const password = request.body.password;

    if (username && password) {
        try {
            // Get MongoDB client connection
            const client =  await MongoClient.connect(process.env.MONGODB_CONN_URI);
            // const client =  app.locals.MongoClient;

            // Define query parameters
            const filter = { 'username': username };
            const projection = {
                '_id': 0,
                'customer_id': 1,
                'first_name': 1, 
                'last_name': 1, 
                'username': 1,
                'password': 0,
                'registration_date': 0
            };

            // Create transactions table object - which will return a cursor that points to result set
            const customersCollection = client.db('customer_data').collection('user_records');
            const customer = await customersCollection.find({}, { 
                '_id': 0,
                'customer_id': 1,
                'first_name': 1, 
                'last_name': 1,
                'username': 1,
                'password': 0,
                'registration_date': 0
                }
            ).toArray();
            console.log(customer);

            // Process user 
            if (customer) {
                request.session.loggedin = true;
                request.session.username = customer[0].username;
                request.session.sessionTimeout = Date.now() + (15 * 60000);

                // Create objetct of URL queries
                const URLQueries = {
                    u_name: customer[0].username,
                    f_name: customer[0].first_name,
                    l_name: customer[0].last_name,
                    c_id: customer[0].customer_id
                };

                const queryString = new URLSearchParams(URLQueries).toString();
                
                response.redirect('/dashboard' + '?' + queryString);
                await client.close();
            } else {
                  // Render an error page or send an error response
                  response.status(401).send('Authentication failed');
                  await client.close();
            }
        } catch (error) {
            
        }
    }
});

app.get('/dashboard', async function (request, response) {
    if (request.query.u_name) {
        // Assign customer variables
        const username = request.query.u_name;
        const firstName = request.query.f_name;
        const lastName = request.query.l_name;
        const customerId = request.query.c_id;

        try {
            // Get MongoDB client connection
            const client =  await MongoClient.connect(process.env.MONGODB_CONN_URI);
            // const client =  app.locals.MongoClient;

            // Define database query parameters
            const filter = { 'user_id': customerId };
            const projections = {'serial_number': 1,
                'date_of_transaction': 1,
                'transaction_description': 1,
                'amount': 1
            };
            const sort = { 'serial_number': 1 };

            // Create transactions table object - which will return a cursor that points to result set
            const transactionsCollection = client.db('customer_data').collection('user_1001_transactions');
            const transactions = await transactionsCollection.find(filter, { projections, sort }).toArray();
        
            if (!transactions) {
              return response.status(404).send('User not found');
            }
            // Generate random customer acount number (if needed)
            const customerAcctNum = 8765432109; // REPLACE
        
            // Render the user dashboard
            response.render('userDashboard', { transactions, customerAcctNum, firstName, lastName, showOverlay: true });
        } catch (error) {
            console.error('Error querying MongoDB:', error);
            response.status(500).send('Internal Server Error');
        }
    }
});

app.get('/signoff', async (request, response) => {
    const client = request.app.locals.mongoClient;

    try {
        // Close the MongoDB connection
        await client.close();

        // Clear the session and log the user out
        request.session.destroy(function (err) {
            if (err) {
                console.error('Error destroying the session:', err);
            }

            // Redirect the user to the login page or any other appropriate page
            response.redirect('/'); // You can customize the redirect URL
        });
    } catch (error) {
        console.error('Error closing the MongoDB connection:', error);
        response.status(500).send('Internal Server Error');
    }
});

export default app;