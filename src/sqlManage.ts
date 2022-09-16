import mysql from 'mysql';

class SQLManage {
    host: string;
    user: string;
    password: string;
    database: string;
    conn: mysql.Connection | null;
    constructor(host = 'localhost', user = 'root', password = '1234', database = "") {
        this.host = host;
        this.user = user;
        this.password = password;
        this.database = database;
        this.conn = null;
    }

    connect = () => {
        this.conn = mysql.createConnection({
            host: this.host,
            user: this.user,
            password: this.password,
            database: this.database,
        });
        this.conn.connect((err: any) => {
            console.log("Mysql连接状态->", err);
        })
    }
}


export default SQLManage