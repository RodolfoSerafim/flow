CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cargo TEXT NOT NULL DEFAULT '',
    admissao TEXT,
    entrada TEXT,
    saida TEXT,
    login TEXT NOT NULL COLLATE NOCASE UNIQUE,
    senha_hash TEXT NOT NULL,
    perfil TEXT NOT NULL CHECK (perfil IN ('admin', 'colaborador')),
    ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
    tentativas INTEGER NOT NULL DEFAULT 0,
    bloqueado_ate INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS pontos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida_intervalo', 'retorno_intervalo', 'saida')),
    registrado_em TEXT NOT NULL,
    requisicao TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS pontos_usuario_data ON pontos(usuario_id, id);
