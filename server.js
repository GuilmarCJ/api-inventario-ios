try {
  require('dotenv').config();
  console.log('✅ dotenv cargado para desarrollo local');
} catch (error) {
  console.log('✅ Usando variables de entorno de Render');
}

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// Configuración de PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Crear tablas al iniciar
async function crearTablas() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios_logueados (
                id SERIAL PRIMARY KEY,
                correo VARCHAR(255) NOT NULL,
                fecha_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS productos (
                id SERIAL PRIMARY KEY,
                id_producto VARCHAR(100) NOT NULL UNIQUE,
                nombre VARCHAR(255) NOT NULL,
                categoria VARCHAR(100),
                stock INTEGER DEFAULT 0,
                usuario_correo VARCHAR(255),
                fecha_importacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS salidas_productos (
                id SERIAL PRIMARY KEY,
                producto_id VARCHAR(100) NOT NULL,
                nombre_producto VARCHAR(255) NOT NULL,
                cantidad INTEGER NOT NULL,
                usuario_correo VARCHAR(255) NOT NULL,
                fecha_salida TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Tablas creadas correctamente');
    } catch (error) {
        console.error('❌ Error creando tablas:', error);
    }
}

// Iniciar servidor
crearTablas();

// ENDPOINTS
app.get('/', (req, res) => {
    res.json({ mensaje: 'API de Inventario funcionando 🚀', fecha: new Date().toISOString() });
});

// Registrar login de usuario
app.post('/api/login-usuario', async (req, res) => {
    try {
        const { correo } = req.body;
        await pool.query('INSERT INTO usuarios_logueados (correo) VALUES ($1)', [correo]);
        res.json({ success: true, mensaje: `Sesión registrada para ${correo}` });
    } catch (error) {
        res.status(500).json({ error: 'Error registrando login' });
    }
});

// Importar productos desde CSV
app.post('/api/importar-productos', async (req, res) => {
    try {
        const { productos, usuario_correo } = req.body;
        let importados = 0;
        
        for (const prod of productos) {
            await pool.query(`
                INSERT INTO productos (id_producto, nombre, categoria, stock, usuario_correo)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (id_producto) 
                DO UPDATE SET nombre = EXCLUDED.nombre, stock = EXCLUDED.stock
            `, [prod.id_producto, prod.nombre, prod.categoria, prod.stock, usuario_correo]);
            importados++;
        }
        
        res.json({ success: true, mensaje: `Se importaron ${importados} productos` });
    } catch (error) {
        res.status(500).json({ error: 'Error importando productos' });
    }
});

// Registrar salida de producto
app.post('/api/registrar-salida', async (req, res) => {
    try {
        const { producto_id, cantidad, usuario_correo } = req.body;
        
        // 1. Verificar producto y stock
        const producto = await pool.query('SELECT * FROM productos WHERE id_producto = $1', [producto_id]);
        if (producto.rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
        if (producto.rows[0].stock < cantidad) return res.status(400).json({ error: 'Stock insuficiente' });
        
        // 2. Registrar salida
        await pool.query(
            'INSERT INTO salidas_productos (producto_id, nombre_producto, cantidad, usuario_correo) VALUES ($1, $2, $3, $4)',
            [producto_id, producto.rows[0].nombre, cantidad, usuario_correo]
        );
        
        // 3. Actualizar stock
        await pool.query('UPDATE productos SET stock = stock - $1 WHERE id_producto = $2', [cantidad, producto_id]);
        
        res.json({ success: true, mensaje: `Salida registrada: ${cantidad} unidades` });
    } catch (error) {
        res.status(500).json({ error: 'Error registrando salida' });
    }
});

// Obtener productos de un usuario
app.get('/api/productos', async (req, res) => {
    try {
        const { usuario_correo } = req.query;
        const result = await pool.query(
            'SELECT * FROM productos WHERE usuario_correo = $1 ORDER BY id_producto',
            [usuario_correo]
        );
        res.json({ success: true, productos: result.rows });
    } catch (error) {
        res.status(500).json({ error: 'Error obteniendo productos' });
    }
});

// Obtener historial de salidas
app.get('/api/historial-salidas', async (req, res) => {
    try {
        const { usuario_correo } = req.query;
        const result = await pool.query(
            'SELECT * FROM salidas_productos WHERE usuario_correo = $1 ORDER BY fecha_salida DESC',
            [usuario_correo]
        );
        res.json({ success: true, salidas: result.rows });
    } catch (error) {
        res.status(500).json({ error: 'Error obteniendo historial' });
    }
});


// ============================================
// 🔍 NUEVO: ENDPOINT PARA VER USUARIOS LOGUEADOS
// ============================================
app.get('/api/usuarios-logueados', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM usuarios_logueados ORDER BY fecha_login DESC'
        );
        res.json({ 
            success: true, 
            total: result.rows.length,
            usuarios: result.rows 
        });
    } catch (error) {
        res.status(500).json({ error: 'Error obteniendo usuarios' });
    }
});

// ============================================
// 🔍 NUEVO: ENDPOINT PARA VER PRODUCTOS
// ============================================
app.get('/api/todos-productos', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM productos ORDER BY fecha_importacion DESC'
        );
        res.json({ 
            success: true, 
            total: result.rows.length,
            productos: result.rows 
        });
    } catch (error) {
        res.status(500).json({ error: 'Error obteniendo productos' });
    }
});

// ============================================
// 🔍 NUEVO: ENDPOINT PARA VER TODAS LAS SALIDAS
// ============================================
app.get('/api/todas-salidas', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM salidas_productos ORDER BY fecha_salida DESC'
        );
        res.json({ 
            success: true, 
            total: result.rows.length,
            salidas: result.rows 
        });
    } catch (error) {
        res.status(500).json({ error: 'Error obteniendo salidas' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 API funcionando en puerto ${PORT}`));