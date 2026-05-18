import http from 'node:http';
import { URL } from 'node:url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config()

const HOST = process.env.BACKEND_HOST || '0.0.0.0';
const PORT = 3454;
const DB_CONFIG = {
	host: process.env.DB_HOST || '10.0.2.15',
	port: Number(process.env.DB_PORT || 3306),
	user: process.env.DB_USER || 'usuario_consulta',
	password: process.env.DB_PASSWORD || '',
	database: process.env.DB_NAME || 'alumnos',
	waitForConnections: true,
	connectionLimit: 10,
	namedPlaceholders: false,
};

const pool = mysql.createPool(DB_CONFIG);

function normalizeText(value) {
	return String(value == null ? '' : value).trim();
}

function getAlumnoPayload(body) {
	return {
		dni: normalizeText(body.dni != null ? body.dni : (body.DNI != null ? body.DNI : body.documento)),
		apellidos: normalizeText(body.apellidos != null ? body.apellidos : (body.apellido != null ? body.apellido : body.lastName)),
		nombres: normalizeText(body.nombres != null ? body.nombres : (body.nombre != null ? body.nombre : body.firstName)),
	};
}

function sendJson(res, statusCode, data) {
	res.writeHead(statusCode, {
		'Content-Type': 'application/json; charset=utf-8',
		'Access-Control-Allow-Origin': '*',
	});
	res.end(JSON.stringify(data));
}

function sendText(res, statusCode, text) {
	res.writeHead(statusCode, {
		'Content-Type': 'text/plain; charset=utf-8',
		'Access-Control-Allow-Origin': '*',
	});
	res.end(String(text));
}

async function verificarConexion() {
	const connection = await pool.getConnection();
	try {
		await connection.ping();
	} finally {
		connection.release();
	}
}

function parseBody(req) {
	return new Promise((resolve, reject) => {
		let raw = '';

		req.on('data', (chunk) => {
			raw += chunk;
			if (raw.length > 1e6) {
				reject(new Error('Body too large'));
				req.destroy();
			}
		});

		req.on('end', () => {
			if (!raw) {
				resolve({});
				return;
			}

			const contentType = (req.headers['content-type'] || '').toLowerCase();

			if (contentType.includes('application/json')) {
				try {
					resolve(JSON.parse(raw));
				} catch (error) {
					reject(new Error('Invalid JSON'));
				}
				return;
			}

			const params = new URLSearchParams(raw);
			resolve(Object.fromEntries(params.entries()));
		});

		req.on('error', reject);
	});
}

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url, `http://${req.headers.host || HOST}`);

	if (req.method === 'OPTIONS') {
		res.writeHead(204, {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		});
		res.end();
		return;
	}

	if (req.method === 'POST' && url.pathname === '/grabaAlumnos') {
		try {
			const body = await parseBody(req);
			const alumno = getAlumnoPayload(body);

			if (!alumno.dni || !alumno.apellidos || !alumno.nombres) {
				sendText(res, 400, '0');
				return;
			}

			const [rows] = await pool.execute('SELECT dni FROM alumnos WHERE dni = ?', [alumno.dni]);
			const existe = rows.length > 0;
			if (existe) {
				sendText(res, 200, '0');
				return;
			}

			await pool.execute(
				'INSERT INTO alumnos (apellidos, nombres, dni) VALUES (?, ?, ?)',
				[alumno.apellidos, alumno.nombres, alumno.dni],
			);
			sendText(res, 200, '1');
		} catch (error) {
			console.error('Error en /grabaAlumnos:', error.message);
			sendText(res, 400, '0');
		}
		return;
	}

	if (req.method === 'GET' && url.pathname === '/consultarAlumnos') {
		try {
			const [rows] = await pool.execute(
				'SELECT apellidos, nombres, dni FROM alumnos ORDER BY apellidos ASC, nombres ASC',
			);
			sendJson(res, 200, rows);
		} catch (error) {
			console.error('Error en /consultarAlumnos:', error.message);
			sendJson(res, 500, { error: 'Database error' });
		}
		return;
	}

	sendJson(res, 404, { error: 'Not found' });
});

(async () => {
	try {
		await verificarConexion();
		server.listen(PORT, HOST, () => {
			console.log(`Backend escuchando en http://${HOST}:${PORT}`);
			console.log(`Base de datos conectada en ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
		});
	} catch (error) {
		console.error('No se pudo conectar a la base de datos:', error.message);
		process.exit(1);
	}
})();
