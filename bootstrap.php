<?php
declare(strict_types=1);

date_default_timezone_set('America/Sao_Paulo');

function configuracao(): array
{
    static $config;
    if ($config === null) {
        $arquivo = __DIR__ . '/config.local.php';
        $config = is_file($arquivo) ? require $arquivo : [];
        if (!is_array($config)) throw new RuntimeException('Configuração inválida.');
    }
    return $config;
}

function banco(): PDO
{
    static $pdo;
    if ($pdo instanceof PDO) return $pdo;
    // Por padrão fica fora da pasta publicada. Hospedagem compartilhada pode
    // usar a pasta data, bloqueada pelo Apache, através de config.local.php.
    $arquivo = getenv('FLOW_DB_PATH') ?: (configuracao()['database_path'] ?? dirname(__DIR__) . '/flow-dados/flow.sqlite');
    $pasta = dirname($arquivo);
    if (!is_dir($pasta) && !mkdir($pasta, 0700, true) && !is_dir($pasta)) {
        throw new RuntimeException('Não foi possível criar a pasta de dados.');
    }
    $pdo = new PDO('sqlite:' . $arquivo, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    $pdo->exec(file_get_contents(__DIR__ . '/schema.sql'));
    return $pdo;
}

function consultar(string $sql, array $parametros = []): PDOStatement
{
    $stmt = banco()->prepare($sql);
    $stmt->execute($parametros);
    return $stmt;
}

function h($valor): string
{
    return htmlspecialchars((string) $valor, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function validarLogin(string $login): string
{
    $login = trim($login);
    if (!preg_match('/\A[a-zA-Z0-9._@-]{3,80}\z/', $login)) {
        throw new InvalidArgumentException('Use um login de 3 a 80 letras, números, ponto, @, hífen ou sublinhado.');
    }
    return $login;
}

function validarSenha(string $senha): void
{
    if (strlen($senha) < 8 || strlen($senha) > 72) {
        throw new InvalidArgumentException('A senha deve ter de 8 a 72 bytes.');
    }
}

function validarColaborador(array $dados): array
{
    $nome = trim((string) ($dados['nome'] ?? ''));
    $cargo = trim((string) ($dados['cargo'] ?? ''));
    if ($nome === '' || $cargo === '' || strlen($nome) > 200 || strlen($cargo) > 120) {
        throw new InvalidArgumentException('Informe nome e cargo válidos.');
    }
    $admissao = (string) ($dados['admissao'] ?? '');
    $data = DateTimeImmutable::createFromFormat('!Y-m-d', $admissao);
    if (!$data || $data->format('Y-m-d') !== $admissao) {
        throw new InvalidArgumentException('Informe uma data de admissão válida.');
    }
    $entrada = (string) ($dados['entrada'] ?? '');
    $saida = (string) ($dados['saida'] ?? '');
    foreach ([$entrada, $saida] as $horario) {
        if (!preg_match('/\A(?:[01][0-9]|2[0-3]):[0-5][0-9]\z/', $horario)) {
            throw new InvalidArgumentException('Informe horários válidos.');
        }
    }
    $login = validarLogin((string) ($dados['login'] ?? ''));
    $senha = (string) ($dados['senha'] ?? '');
    validarSenha($senha);
    return [$nome, $cargo, $admissao, $entrada, $saida, $login, password_hash($senha, PASSWORD_DEFAULT)];
}

function ultimoPonto(int $usuarioId)
{
    return consultar('SELECT * FROM pontos WHERE usuario_id = ? ORDER BY id DESC LIMIT 1', [$usuarioId])->fetch();
}

function gerarSenhaColaborador(): string
{
    return rtrim(strtr(base64_encode(random_bytes(12)), '+/', '-_'), '=');
}

function cadastrarColaborador(array $cadastro): array
{
    $senha = gerarSenhaColaborador();
    for ($tentativa = 0; $tentativa < 5; $tentativa++) {
        $cadastro['login'] = 'colab.' . bin2hex(random_bytes(4));
        $cadastro['senha'] = $senha;
        $dados = validarColaborador($cadastro);
        try {
            consultar("INSERT INTO usuarios (nome, cargo, admissao, entrada, saida, login, senha_hash, perfil) VALUES (?, ?, ?, ?, ?, ?, ?, 'colaborador')", $dados);
            return ['id' => (int) banco()->lastInsertId(), 'nome' => $dados[0], 'login' => $dados[5], 'senha' => $senha];
        } catch (PDOException $e) {
            if ((string) $e->getCode() !== '23000') throw $e;
        }
    }
    throw new RuntimeException('Não foi possível gerar um login exclusivo. Tente novamente.');
}

function renovarSenhaColaborador(int $id): array
{
    $colaborador = consultar("SELECT id, nome, login FROM usuarios WHERE id = ? AND perfil = 'colaborador' AND ativo = 1", [$id])->fetch();
    if (!$colaborador) throw new InvalidArgumentException('Selecione um funcionário ativo para gerar uma nova senha.');
    $senha = gerarSenhaColaborador();
    consultar('UPDATE usuarios SET senha_hash = ?, tentativas = 0, bloqueado_ate = 0 WHERE id = ?', [password_hash($senha, PASSWORD_DEFAULT), $id]);
    return ['id' => (int) $colaborador['id'], 'nome' => $colaborador['nome'], 'login' => $colaborador['login'], 'senha' => $senha];
}

function urlAcessoColaborador(): string
{
    $base = (string) (configuracao()['public_url'] ?? '');
    if ($base === '') {
        $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
        if (!preg_match('/\A[a-zA-Z0-9.-]+(?::[0-9]{1,5})?\z/', $host)) return 'index.php?acesso=colaborador';
        $protocolo = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http';
        $pasta = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/index.php')), '/.');
        $base = $protocolo . '://' . $host . $pasta;
    }
    return rtrim($base, '/') . '/index.php?acesso=colaborador';
}

function proximosPontos($ultimo): array
{
    if (!$ultimo || $ultimo['tipo'] === 'saida') return ['entrada'];
    if ($ultimo['tipo'] === 'entrada') return ['saida_intervalo', 'saida'];
    if ($ultimo['tipo'] === 'saida_intervalo') return ['retorno_intervalo'];
    return ['saida'];
}

function registrarPonto(int $usuarioId, string $tipo, string $requisicao): void
{
    $pdo = banco();
    // Bloqueio de escrita antes da leitura impede duas batidas simultâneas.
    $pdo->exec('BEGIN IMMEDIATE');
    try {
        $usuario = consultar('SELECT * FROM usuarios WHERE id = ?', [$usuarioId])->fetch();
        if (!$usuario || $usuario['perfil'] !== 'colaborador' || !(int) $usuario['ativo']) {
            throw new InvalidArgumentException('Colaborador sem acesso ao ponto.');
        }
        if (consultar('SELECT id FROM pontos WHERE requisicao = ? AND usuario_id = ?', [$requisicao, $usuarioId])->fetch()) {
            $pdo->exec('COMMIT');
            return;
        }
        $ultimo = ultimoPonto($usuarioId);
        if (!in_array($tipo, proximosPontos($ultimo), true)) {
            throw new InvalidArgumentException('Essa batida não corresponde à próxima etapa da jornada. Atualize a página.');
        }
        $agora = new DateTimeImmutable();
        if ($usuario['admissao'] > $agora->format('Y-m-d')) {
            throw new InvalidArgumentException('O registro será liberado a partir da data de admissão.');
        }
        if ($ultimo && $agora->getTimestamp() - (new DateTimeImmutable($ultimo['registrado_em']))->getTimestamp() < 10) {
            throw new InvalidArgumentException('Aguarde alguns segundos antes de registrar outra batida.');
        }
        consultar('INSERT INTO pontos (usuario_id, tipo, registrado_em, requisicao) VALUES (?, ?, ?, ?)',
            [$usuarioId, $tipo, $agora->format('Y-m-d\TH:i:sP'), $requisicao]);
        $pdo->exec('COMMIT');
    } catch (Throwable $e) {
        $pdo->exec('ROLLBACK');
        throw $e;
    }
}
