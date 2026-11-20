<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
$https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
$local = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
if (!$https && !$local) {
    http_response_code(400);
    exit('Acesse esta instalação por HTTPS depois de ativar o certificado SSL.');
}
session_set_cookie_params(['httponly' => true, 'secure' => $https, 'samesite' => 'Strict']);
session_start();
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'self'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'");
$_SESSION['csrf_instalacao'] = $_SESSION['csrf_instalacao'] ?? bin2hex(random_bytes(32));
$erro = ''; $concluido = false;
try {
    $hash = configuracao()['setup_token_hash'] ?? '';
    if ($hash === '' || (int) consultar("SELECT COUNT(*) FROM usuarios WHERE perfil = 'admin'")->fetchColumn() > 0) {
        http_response_code(404); exit;
    }
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!is_string($_POST['csrf'] ?? null) || !hash_equals($_SESSION['csrf_instalacao'], $_POST['csrf'])) {
            throw new InvalidArgumentException('Atualize a página e tente novamente.');
        }
        if (($_POST['acao'] ?? '') === 'autorizar') {
            $chave = (string) ($_POST['chave'] ?? '');
            if (!preg_match('/\A[a-f0-9]{64}\z/', $chave) || !password_verify($chave, $hash)) {
                throw new InvalidArgumentException('Chave de instalação inválida.');
            }
            session_regenerate_id(true);
            $_SESSION['instalacao_autorizada_ate'] = time() + 900;
            $_SESSION['csrf_instalacao'] = bin2hex(random_bytes(32));
            header('Location: instalar.php'); exit;
        }
        if (($_POST['acao'] ?? '') !== 'criar' || (int) ($_SESSION['instalacao_autorizada_ate'] ?? 0) < time()) {
            throw new InvalidArgumentException('Informe a chave de instalação antes de criar o administrador.');
        }
        $nome = trim((string) ($_POST['nome'] ?? ''));
        $login = validarLogin((string) ($_POST['login'] ?? ''));
        $senha = (string) ($_POST['senha'] ?? '');
        validarSenha($senha);
        if ($nome === '' || strlen($nome) > 200) throw new InvalidArgumentException('Informe um nome válido.');
        if ($senha !== (string) ($_POST['confirmacao'] ?? '')) throw new InvalidArgumentException('As senhas não coincidem.');
        $pdo = banco(); $pdo->exec('BEGIN IMMEDIATE');
        try {
            if ((int) consultar("SELECT COUNT(*) FROM usuarios WHERE perfil = 'admin'")->fetchColumn() > 0) {
                throw new InvalidArgumentException('A instalação já foi concluída.');
            }
            consultar("INSERT INTO usuarios (nome, login, senha_hash, perfil) VALUES (?, ?, ?, 'admin')", [$nome, $login, password_hash($senha, PASSWORD_DEFAULT)]);
            $pdo->exec('COMMIT');
        } catch (Throwable $e) { $pdo->exec('ROLLBACK'); throw $e; }
        unset($_SESSION['instalacao_autorizada_ate'], $_SESSION['csrf_instalacao']);
        session_regenerate_id(true);
        $concluido = true;
    }
} catch (InvalidArgumentException $e) { $erro = $e->getMessage(); }
catch (Throwable $e) { error_log((string) $e); http_response_code(503); $erro = 'A instalação não pôde acessar o banco. Verifique a configuração e a pasta de dados.'; }
$autorizado = (int) ($_SESSION['instalacao_autorizada_ate'] ?? 0) >= time();
?>
<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Instalação — Flow ERP</title><link rel="stylesheet" href="style.css"></head><body>
<header class="topo"><img class="logo" src="logo-flow-erp.png" alt="Flow ERP"></header><main class="conteudo"><div class="painel"><h1>Configurar o Flow ERP</h1>
<?php if ($erro): ?><p class="alerta erro" role="alert"><?= h($erro) ?></p><?php endif; ?>
<?php if ($concluido): ?><p class="alerta sucesso">Administrador criado. A instalação foi encerrada e não pode ser reutilizada.</p><a class="botao" href="index.php">Entrar no sistema</a>
<?php elseif (!$autorizado): ?><p>Informe a chave privada de instalação fornecida durante a preparação da hospedagem.</p><form method="post" class="formulario"><input type="hidden" name="csrf" value="<?= h($_SESSION['csrf_instalacao']) ?>"><input type="hidden" name="acao" value="autorizar"><div class="campo largo"><label for="chave">Chave de instalação</label><input id="chave" name="chave" type="password" required maxlength="64" autocomplete="off"></div><div class="acoes"><button>Continuar</button></div></form>
<?php else: ?><p>Defina o acesso da empresa. Essa conta poderá cadastrar funcionários e consultar os pontos.</p><form method="post" class="formulario"><input type="hidden" name="csrf" value="<?= h($_SESSION['csrf_instalacao']) ?>"><input type="hidden" name="acao" value="criar"><div class="campo largo"><label for="nome">Nome da empresa ou administrador</label><input id="nome" name="nome" required maxlength="200" autocomplete="organization"></div><div class="campo largo"><label for="login">Login</label><input id="login" name="login" required minlength="3" maxlength="80" autocomplete="username"></div><div class="campo"><label for="senha">Senha (mínimo 8 caracteres)</label><input id="senha" name="senha" type="password" required minlength="8" maxlength="72" autocomplete="new-password"></div><div class="campo"><label for="confirmacao">Confirmar senha</label><input id="confirmacao" name="confirmacao" type="password" required minlength="8" maxlength="72" autocomplete="new-password"></div><div class="acoes"><button>Criar administrador</button></div></form><?php endif; ?>
</div></main></body></html>
