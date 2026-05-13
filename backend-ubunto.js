import http from 'node:http';
import { URL } from 'node:url';

const HOST = '10.0.2.15';
const PORT = 3454;

const alumnos = [];

function normalizeText(value) {
	return String(value ?? '').trim();
}

function getAlumnoPayload(body) {
	return {
		dni: normalizeText(body.dni ?? body.DNI ?? body.documento),
		apellidos: normalizeText(body.apellidos ?? body.apellido ?? body.lastName),
		nombres: normalizeText(body.nombres ?? body.nombre ?? body.firstName),
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

function ordenarAlumnos(lista) {
	return [...lista].sort((a, b) => {
		const apellidosA = a.apellidos.localeCompare(b.apellidos, 'es', { sensitivity: 'base' });
		if (apellidosA !== 0) {
			return apellidosA;
		}

		return a.nombres.localeCompare(b.nombres, 'es', { sensitivity: 'base' });
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

			const existe = alumnos.some((registro) => registro.dni === alumno.dni);
			if (existe) {
				sendText(res, 200, '0');
				return;
			}

			alumnos.push(alumno);
			sendText(res, 200, '1');
		} catch (error) {
			sendText(res, 400, '0');
		}
		return;
	}

	if (req.method === 'GET' && url.pathname === '/consultarAlumnos') {
		sendJson(res, 200, ordenarAlumnos(alumnos));
		return;
	}

	sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, HOST, () => {
	console.log(`Backend escuchando en http://${HOST}:${PORT}`);
});
