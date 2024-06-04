const express = require('express')
const app = express()
const cors = require('cors')
const cookieParser = require('cookie-parser')
const morgan = require('morgan')
const jwt = require('jsonwebtoken')
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const port = process.env.PORT || 5000

// MongoDb URI
const uri = process.env.MONGODB_URI

// Middlewares
const corsOptions = {
  origin: [
    'https://petpalshub.vercel.app',
    'http://localhost:5173',
    'https://petpals-hub.vercel.app',
    'http://localhost:5174',
    'https://api.imgbb.com'
  ],
  credentials: true,
  optionSuccessStatus: 200
}

app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())
app.use(morgan('dev'))

// Verify Token

const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token

  console.log('token====>', token)
  if (!token) {
    console.log('Token not available')
    return res.status(401).send({ message: 'unauthorized access' })
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err)
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.user = decoded
    next()
  })
}

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true
  }
})

async function run () {
  const database = client.db('PetPalsHub')
  const usersCollection = database.collection('users')
  const petsCollections = database.collection('pets')
  const adoptCollection = database.collection('adopt')
  try {
    // Verify Admin
    const verifyAdmin = async (req, res, next) => {
      try {
        const user = req.user

        if (!user || !user.email) {
          console.log('No user or email in request')
          return res.status(401).send({ message: 'Unauthorized access' })
        }

        const query = { email: user.email }
        const result = await usersCollection.findOne(query)

        if (!result) {
          console.log('No user found with the given email')
          return res.status(401).send({ message: 'Unauthorized access' })
        }

        if (result.role !== 'admin') {
          console.log(`User role is ${result.role}, not admin`)
          return res.status(401).send({ message: 'Unauthorized access' })
        }

        console.log('User is verified as admin')
        next()
      } catch (error) {
        console.error('Error in verifyAdmin middleware:', error)
        return res.status(500).send({ message: 'Internal Server Error' })
      }
    }

    // Verify Adopter

    const verifyAdopter = async (req, res, next) => {
      try {
        const user = req.user

        if (!user || !user.email) {
          console.log('No user or email in request')
          return res.status(401).send({ message: 'Unauthorized access' })
        }

        const query = { email: user.email }
        const result = await usersCollection.findOne(query)

        if (!result) {
          console.log('No user found with the given email')
          return res.status(401).send({ message: 'Unauthorized access' })
        }

        if (result.role !== 'adopter') {
          console.log(`User role is ${result.role}, not adopter`)
          return res.status(401).send({ message: 'Unauthorized access' })
        }

        console.log('User is verified as Adopter')
        next()
      } catch (error) {
        console.error('Error in verifyHost middleware:', error)
        return res.status(500).send({ message: 'Internal Server Error' })
      }
    }

    // Auth Related api
    app.post('/jwt', async (req, res) => {
      const user = req.body
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '365d'
      })
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
        })
        .send({ success: true })
    })

    // LogOut

    app.get('/logout', async (req, res) => {
      try {
        res
          .clearCookie('token', {
            maxAge: 0,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
          })
          .send({ message: true })
        console.log('Logout successfully')
      } catch (error) {
        res.status(500).send({ message: error.message })
      }
    })
    // Save or modify user email, status in db and become a adopter
    app.put('/users/:email', async (req, res) => {
      const email = req.params.email
      const user = req.body
      console.log(user)
      const query = { email: email }
      const options = { upsert: true }
      const isExist = await usersCollection.findOne(query)
      console.log('user found', isExist)
      if (isExist) {
        if (user.status === 'Requested') {
          const updatedDoc = {
            $set: {
              status: 'Requested'
            }
          }
          const result = await usersCollection.updateOne(
            query,
            updatedDoc,
            options
          )
          return res.send(result)
        } else {
          return res.send(isExist)
        }
      }
      const result = await usersCollection.updateOne(
        query,
        { $set: { ...user, timestamp: Date.now() } },
        options
      )
      res.send(result)
    })

    // Save Pet in Database
    app.post('/pets', verifyToken, async (req, res) => {
      const pet = req.body

      const result = await petsCollections.insertOne(pet)
      res.send(result)
    })

    // Save Adoption info in database
    app.post('/adoption', verifyToken, async (req, res) => {
      const adoption = req.body
      const result = await adoptCollection.insertOne(adoption)
      res.send(result)
    })
    // Get all pets from database
    app.get('/pets', async (req, res) => {
      const limit = parseInt(req.query.limit) || 4
      const page = parseInt(req.query.page) || 1
      const skip = (page - 1) * limit
      try {
        const pets = await petsCollections
          .find({})
          .skip(skip)
          .limit(limit)
          .toArray()
        res.send(pets)
      } catch (error) {
        console.log('error fetching pets========>', error)
        res.status(500).send({ message: 'Internal Server Error' })
      }
    })
    // Get Single Pet Form Database
    app.get('/pet/:id', verifyToken, async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const pet = await petsCollections.findOne(query)
      res.send(pet)
    })
    // Get All users for admin
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const users = await usersCollection.find({}).toArray()
      res.send(users)
    })
    // Get user role
    app.get('/user/:email', verifyToken, async (req, res) => {
      const email = req.params.email
      const result = await usersCollection.findOne({ email: email })
      console.log(result)
      res.send(result)
    })
    // Get All Adoptions for user by email
    app.get('/adoptions', verifyToken, async (req, res) => {
      const email = req.query.email
      if (!email) {
        return res.send([])
      }
      const query = { 'user.email': email }
      const result = await adoptCollection.find(query).toArray()
      res.send(result)
    })
    // Get All Adopted Pets for adopter by email
    app.get('/pets/:email', verifyToken, verifyAdopter, async (req, res) => {
      const email = req.params.email
      if (!email) {
        return res.send([])
      }
      const query = { 'adopter.email': email }
      const cursor = petsCollections.find(query)
      const result = await cursor.toArray()

      res.send(result)
    })

    // Updated User Role
    app.put(
      '/users/update/:email',
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email
        const user = req.body
        const query = { email: email }
        const options = { upsert: true }
        const updatedDoc = {
          $set: {
            ...user,
            role: user.role,
            timestamp: Date.now()
          }
        }
        const result = await usersCollection.updateOne(
          query,
          updatedDoc,
          options
        )
        res.send(result)
      }
    )

    // Get Adopted Pets for Adopter by email
    app.get(
      '/adopted/pets/:email',
      verifyToken,
      verifyAdopter,
      async (req, res) => {
        const email = req.params.email
        const query = { adopter: email }
        const result = await adoptCollection.find(query).toArray()
        res.send(result)
      }
    )
    // Delete Added Pet from database
    app.delete('/pets/:id', verifyToken, verifyAdopter, async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await petsCollections.deleteOne(query)
      res.send(result)
    })

    // Admin Stat Data
    app.get('/admin-stat', verifyToken, verifyAdmin, async (req, res) => {
      const userCount = await usersCollection.countDocuments()
      const petCount = await petsCollections.countDocuments()
      const totalAdopt = await adoptCollection.countDocuments()

      res.send({
        userCount,
        petCount,
        totalAdopt
      })
    })

    // Get All Donation from server for users
    app.get('/donations/:email', verifyToken, async (req, res) => {
      const email = req.params.email
      const query = { 'user.email': email }
      const result = await adoptCollection.find(query).toArray()
      res.send(result)
    })
    // Get All Pets from server for Adopter
    app.get('/adopter/:email', verifyToken, async (req, res) => {
      const email = req.params.email
      const query = { 'adopter.email': email }
      const result = await adoptCollection.find(query).toArray()
      res.send(result)
    })

    // Pet Status Update
    app.put(
      '/pets/update/:id',
      verifyToken,
      verifyAdopter,
      async (req, res) => {
        const id = req.params.id
        const pet = req.body
        const query = { _id: new ObjectId(id) }
        const options = { upsert: true }
        const updatedDoc = {
          $set: {
            ...pet,
            status: 'verified'
          }
        }
        const result = await adoptCollection.updateOne(
          query,
          updatedDoc,
          options
        )

        res.send(result)
      }
    )

    // cancel adopted pets request
    app.delete('/pet/cancel/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await adoptCollection.deleteOne(query)
      res.send(result)
    })

    // Connect the client to the server	(optional starting in v4.7)
    await client.connect()
    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close()
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Server Is Running......')
})

app.listen(port, () => console.log(`Server Running on Port: ${port}`))
