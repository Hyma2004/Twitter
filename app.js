const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebToken");
const bcrypt = require("bcrypt");
const app = express();
app.use(express.json());
let db = null;
const dbPath = path.join(__dirname, "twitterClone.db");
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at localhost:3000/");
    });
  } catch (e) {
    console.log("Db Error:${e.message}");
    process.exit(1);
  }
};
initializeDbAndServer();
//authenticate token function
function authenticateToken(request, response, next) {
  let jwtToken;
  const authHeaders = request.headers["authorization"];
  if (authHeaders !== undefined) {
    jwtToken = authHeaders.split(" ")[1];
  }
  if (authHeaders === undefined) {
    response.status(400);
    response.send("Invalid JWT token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async(error, payload));
    if (error) {
      response.status(401);
      response.send("Invalid JWT Token");
    } else {
      next();
    }
  }
}
//API 1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const selectUserQuery = `SELECT * FROM user;`;
  const dbUser = await db.run(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password length is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      insertQuery = `INSERT INTO user (username,password,name,gender) VALUES('${username}','${password}','${name}','${gender}');`;
      await db.run(insertQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});
//API2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const { payload } = username;
  const jwtToken = jwt.sign(payload, "MY_SECRET_KEY");
  const checkQuery = `SELECT *FROM user WHERE username='${username}';`;
  const dbUser = await db.get(checkQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid User");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid,Password");
    }
  }
});
const isUserFollowing = async (request, response, next) => {
  const { tweetId } = request.params;
  const { username } = request.headers;
  const userQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(userQuery);
  const userId = dbUser["user_id"];
  const followingQuery = `SELECT following_user_id from follower WHERE follower_user_id=${userId};`;
  const userFollowingData = await db.all(followingQuery);
  const tweetUserIdQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId};`;
  const tweetData = await db.get(tweetUserIdQuery);
  const tweetUserId = tweetData["user_id"];
  let isTweetUSerIDInFollowingIds = false;
  userFollowingData.foreach((each) => {
    if (each["following_user_id"] === tweetUserID) {
      isTweetUSerIDInFollowingIds = true;
    }
  });

  if (isTweetUSerIDInFollowingIds) {
    next();
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
};
//API3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request.headers;
  const getUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(getUserQuery);
  const userId = dbUser["user_id"];
  const query = `SELECT username,tweet,date_time as dateTime FROM follower INNER JOIN tweet ON follower.following_user_id=tweet.user_id NATURAL JOIN user
    WHERE follower.follower_user_id = ${userId}
    ORDER BY dateTime DESC
    LIMIT 4`;
  const data = await db.all(query);
  response.send(data);
});
//API 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request.headers;
  const getQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(getQuery);
  const userId = dbUser["user_id"];
  const query = `SELECT name FROM follower INNER JOIN user ON follower.following_user_id=user.user_id WHERE follower_user_id=${userId};`;
  const data = await db.all(query);
  response.send(data);
});
//API5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request.headers;
  const getQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(getQuery);
  const userId = dbUser["user_id"];
  const query = `SELECT name FROM follower INNER JOIN user ON follower.follower_user_id=user.user_id WHERE following_user_id=${userId};`;
  const data = await db.all(query);
  response.send(data);
});
//API 6
app.get(
  "/tweets/:tweetId/",
  authenticateToken,
  isUserFollowing,
  async (request, response) => {
    const { tweetId } = request.params;
    const query = `
        SELECT tweet, COUNT() AS replies, date_time AS dateTime 
        FROM tweet INNER JOIN reply
        ON tweet.tweet_id = reply.tweet_id   
        WHERE tweet.tweet_id = ${tweetId};`;
    const data = await db.get(query);

    const likesQuery = `
        SELECT COUNT() AS likes
        FROM like WHERE tweet_id  = ${tweetId};`;
    const { likes } = await db.get(likesQuery);

    data.likes = likes;
    response.send(data);
  }
);
//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const query = `SELECT username FROM likes NATURAL JOIN user WHERE tweet_id=${tweetId};`;
    const dbUser = await db.get(query);
    const userNamesArray = dbUser.map((each) => each.username);
    response.send(userNamesArray);
  }
);
//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const query = `SELECT name,reply FROM reply NATURAL JOIN user WHERE tweet_id=${tweetId};`;
    const data = await db.get(query);
    response.send({ replies: data });
  }
);
//API9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request.headers;
  const getUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(getUserQuery);
  const userId = dbUser["user_id"];

  const query = `
    SELECT tweet, COUNT() AS likes, date_time As dateTime
    FROM tweet INNER JOIN like
    ON tweet.tweet_id = like.tweet_id
    WHERE tweet.user_id = ${userId}
    GROUP BY tweet.tweet_id;`;
  let likesData = await db.all(query);

  const repliesQuery = `
    SELECT tweet, COUNT() AS replies
    FROM tweet INNER JOIN reply
    ON tweet.tweet_id = reply.tweet_id
    WHERE tweet.user_id = ${userId}
    GROUP BY tweet.tweet_id;`;

  const repliesData = await db.all(repliesQuery);

  likesData.forEach((each) => {
    for (let data of repliesData) {
      if (each.tweet === data.tweet) {
        each.replies = data.replies;
        break;
      }
    }
  });
  response.send(likesData);
});
//API 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request.headers;
  const getUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(getUserQuery);
  const userId = dbUser["user_id"];

  const query = `
    INSERT INTO 
        tweet(tweet, user_id)
    VALUES ('${tweet}', ${userId});`;
  await db.run(query);
  response.send("Created a Tweet");
});
//API 11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request.headers;
    const getUserQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
    const dbUser = await db.get(getUserQuery);
    const userId = dbUser["user_id"];

    const userTweetsQuery = `
    SELECT tweet_id, user_id 
    FROM tweet
    WHERE user_id = ${userId};`;
    const userTweetsData = await db.all(userTweetsQuery);

    let isTweetUsers = false;
    userTweetsData.forEach((each) => {
      if (each["tweet_id"] == tweetId) {
        isTweetUsers = true;
      }
    });

    if (isTweetUsers) {
      const query = `
        DELETE FROM tweet
        WHERE tweet_id = ${tweetId};`;
      await db.run(query);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
module.exports = app;
