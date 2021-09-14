const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeAndStartServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3007, () => {
      console.log("Server Running at http://localhost:3007/");
    });
  } catch (e) {
    console.log(`DB Error is ${e.message}`);
    process.exit(1);
  }
};

initializeAndStartServer();

/// API 1

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  console.log(request.body);
  const userQuery = `select * from user where username = '${username}';`;
  const data = await db.get(userQuery);
  const passwordLength = request.body.password.length;

  console.log(request.body.password);

  if (data === undefined) {
    if (passwordLength < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashPassword = await bcrypt.hash(request.body.password, 10);
      const createUserQuery = `
        insert into user
        (name, username, password, gender)
        values(
            '${name}',
            '${username}',
            '${hashPassword}',
            '${gender}'
        );
        `;
      await db.run(createUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

/// API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  console.log(request.body);
  const checkUserQuery = `
  select * from user where username = '${username}';`;
  const dbResponse = await db.get(checkUserQuery);
  console.log(dbResponse);
  if (dbResponse === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      dbResponse.password
    );
    if (isPasswordMatched) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "SECRET");
      console.log(jwtToken);
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateToken = async (request, response, next) => {
  const authHeader = request.headers["authorization"];
  console.log(authHeader);
  const jwtToken = authHeader.split(" ")[1];
  console.log(jwtToken);
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    const isTrue = await jwt.verify(
      jwtToken,
      "SECRET",
      async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = payload.username;

          next();
        }
      }
    );
  }
};

/// API 3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const idQuery = `select user_id from user where username = '${username}'`;
  const idResponse = await db.get(idQuery);
  const { user_id } = idResponse;
  console.log(user_id);

  const getQuery = `
  select 
  user.username as username,
   tweet.tweet as tweet,
    tweet.date_time as dateTime 
    from user inner join tweet 
    on user.user_id = tweet.user_id 
    where tweet.user_id in 
    ( select following_user_id from follower 
        where follower_user_id = ${user_id}) 
        order by dateTime desc,
        username desc
        limit 4
        offset 0;`;
  const dbResponse = await db.all(getQuery);
  response.send(dbResponse);
});

/// API 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const idQuery = `select user_id from user where username = '${username}'`;
  const idResponse = await db.get(idQuery);
  const { user_id } = idResponse;

  const getFollowingUsersQuery = `
    select
     name
      from user
      where user_id in (
         select following_user_id from follower
          where follower_user_id = ${user_id}) ; `;

  const dbResponse = await db.all(getFollowingUsersQuery);
  response.send(dbResponse);
});

/// API 5
app.get("/user/followers", authenticateToken, async (request, response) => {
  const { username } = request;
  const idQuery = `select user_id from user where username = '${username}'`;
  const idResponse = await db.get(idQuery);
  const { user_id } = idResponse;

  const getFollowersList = `
  select
     name
      from user
      where user_id in (
         select follower_user_id from follower
          where following_user_id = ${user_id}) 
     ;
  `;
  const followersList = await db.all(getFollowersList);
  response.send(followersList);
});

/// API 6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  console.log(username);

  const idQuery = `select user_id from user where username = '${username}'`;
  const idResponse = await db.get(idQuery);
  const { user_id } = idResponse;

  const getTweet = `
    select 
    tweet,
   ( select count(like_id) from like where tweet_id = ${tweetId}) as likes,
    (select count(reply) from reply where tweet_id = ${tweetId}) as replies,
    date_time as dateTime
    from tweet 
    where user_id in (
         select following_user_id from follower
          where follower_user_id = ${user_id})  and tweet_id=${tweetId}
    group by tweet;`;
  const dbResponse = await db.get(getTweet);
  if (dbResponse === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(dbResponse);
  }
});

///API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;

    const idQuery = `select user_id from user where username = '${username}'`;
    const idResponse = await db.get(idQuery);
    const { user_id } = idResponse;
    const getWhoLiked = `
    select 
    ( username ) as likes
    from like inner join user on user.user_id = like.user_id
    where (
        (select user_id from tweet where tweet_id = ${tweetId}) in (
         select following_user_id from follower
          where follower_user_id = ${user_id})
    )and like.tweet_id=${tweetId} 
    
    ;
    `;

    const dbResponse = await db.all(getWhoLiked);
    if (dbResponse === undefined || dbResponse.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send(dbResponse);
    }
  }
);

/// API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;

    const idQuery = `select user_id from user where username = '${username}'`;
    const idResponse = await db.get(idQuery);
    const { user_id } = idResponse;

    const getReplies = `
    select
    
        user.name,
        reply.reply
    
     from reply inner join user on reply.user_id = user.user_id
    where (
        (select user_id from tweet where tweet_id = ${tweetId}) in (
         select following_user_id from follower
          where follower_user_id = ${user_id})
    ) and reply.tweet_id = ${tweetId}`;

    const getReplyResponse = await db.all(getReplies);
    if (getReplyResponse === undefined || getReplyResponse.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send(getReplyResponse);
    }
  }
);

///  API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;

  const idQuery = `select user_id from user where username = '${username}'`;
  const idResponse = await db.get(idQuery);
  const { user_id } = idResponse;
  console.log(user_id);
  const getTweets = `
    select 
    tweet,
    ( select count(like_id) from like where tweet_id = (select tweet_id from tweet where user_id = ${user_id})) as likes,
    ( select count(reply) from reply where tweet_id = (select tweet_id from tweet where user_id = ${user_id})) as replies,
    
    date_time as dateTime 
    from tweet where user_id = ${user_id};
    `;

  const getTweetsResponse = await db.all(getTweets);
  response.send(getTweetsResponse);
});

/// API 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;

  const idQuery = `select user_id from user where username = '${username}'`;
  const idResponse = await db.get(idQuery);
  const { user_id } = idResponse;

  const date_time = new Date();
  console.log(date_time);

  const createTweet = `
    insert into 
    tweet (tweet, user_id, date_time)
    values ('${tweet}', ${user_id}, '${date_time}');
    `;

  const dbResponse = await db.run(createTweet);
  response.send("Created a Tweet");
});

/// API 11
app.delete("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const idQuery = `select user_id from user where username = '${username}'`;
  const idResponse = await db.get(idQuery);
  const { user_id } = idResponse;

  const query = ` select tweet from tweet where tweet_id =${tweetId} and user_id =${user_id};`;
  const Response = await db.get(query);
  console.log(Response);

  if (Response === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const deleteTweet = `
    delete from 
    tweet where  tweet in (select tweet from tweet where user_id = ${user_id}) and tweet_id =${tweetId} ;
    `;
    const dbResponse = await db.run(deleteTweet);

    response.send("Tweet Removed");
  }
});

module.exports = app;
