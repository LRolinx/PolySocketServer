import mysql from 'mysql';

export default class SQLManage {
    private pool: mysql.Pool | null = null;

    constructor(private host = 'localhost', private user = 'root', private password = '', private database = '') {}

    connect(): SQLManage {
        this.pool = mysql.createPool({ host: this.host, user: this.user, password: this.password, database: this.database });
        return this;
    }

    query(sql: string, values: any[] = []): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.pool) { reject(new Error('数据库未连接')); return; }
            this.pool.query(sql, values, (error, rows) => error ? reject(error) : resolve(rows));
        });
    }

    close(): Promise<void> {
        const pool = this.pool;
        this.pool = null;
        return new Promise((resolve, reject) => {
            if (!pool) { resolve(); return; }
            pool.end((error) => error ? reject(error) : resolve());
        });
    }
}
