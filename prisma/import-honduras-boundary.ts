import 'dotenv/config';
import { readFileSync } from 'fs';
import { Pool } from 'pg';

async function main() {
  const geojson = JSON.parse(
    readFileSync('./honduras-boundary.geojson', 'utf-8'),
  );
  const geometry = geojson.features
    ? geojson.features[0].geometry
    : geojson.geometry;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  await pool.query(`CREATE EXTENSION IF NOT EXISTS postgis;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS honduras_boundary (
      id SERIAL PRIMARY KEY,
      geom geometry(Geometry, 4326)
    );
  `);
  await pool.query(`DELETE FROM honduras_boundary;`);

  await pool.query(
    `INSERT INTO honduras_boundary (geom) VALUES (ST_GeomFromGeoJSON($1))`,
    [JSON.stringify(geometry)],
  );

  console.log('Polígono de Honduras importado correctamente.');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
