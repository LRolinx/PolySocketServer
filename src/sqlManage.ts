import mysql from 'mysql';

class SQLManage {
    private host: string;
    private user: string;
    private password: string;
    private database: string;
    private pool: mysql.Pool | null;
    constructor(host = 'localhost', user = 'root', password = '1234', database = "") {
        this.host = host;
        this.user = user;
        this.password = password;
        this.database = database;
        this.pool = null;
    }

    connect = (): SQLManage => {
        this.pool = mysql.createPool({
            host: this.host,
            user: this.user,
            password: this.password,
            database: this.database,
        });
        // this.conn.connect((err: any) => {
        //     if (err == null) {
        //         console.log("Mysql连接成功");
        //     } else {
        //         console.log("Mysql连接出现问题->", err);
        //     }
        // })
        return this;
    }

    query = (sql: string, values: string = '') => {
        return new Promise((resolve, reject) => {
            this.pool?.getConnection((err, connection) => {
                if (err) {
                    reject(err)
                } else {
                    connection.query(sql, values, (err, rows) => {
                        if (err) {
                            reject(err)
                        } else {
                            resolve(rows)
                        }

                        connection.release();
                    })
                }
            })
        })
    }
}


export default SQLManage