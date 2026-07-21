# fintrackker

## MySQL setup

The server now uses MySQL/MariaDB instead of the previous file-based storage.

### 1. Start a local database

If you use MariaDB locally, start it with:

```bash
sudo service mariadb start
```

### 2. Create the database and user

```sql
CREATE DATABASE IF NOT EXISTS fintrackker;
CREATE USER IF NOT EXISTS 'fintrackker'@'localhost' IDENTIFIED BY 'fintrackker';
GRANT ALL PRIVILEGES ON fintrackker.* TO 'fintrackker'@'localhost';
FLUSH PRIVILEGES;
```

### 3. Run the server

```bash
cd server
MYSQL_HOST=127.0.0.1 \
MYSQL_PORT=3306 \
MYSQL_USER=fintrackker \
MYSQL_PASSWORD=fintrackker \
MYSQL_DATABASE=fintrackker \
npm run dev
```
