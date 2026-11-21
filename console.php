<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/bootstrap.php';
if (($argv[1] ?? '') !== 'criar-admin') {
    fwrite(STDERR, "Uso: php console.php criar-admin\nInforme nome, login e senha quando solicitado.\n");
    exit(1);
}
try {
    fwrite(STDOUT, 'Nome da empresa ou administrador: ');
    $nome = trim((string) fgets(STDIN));
    fwrite(STDOUT, 'Login: ');
    $login = validarLogin(trim((string) fgets(STDIN)));
    fwrite(STDOUT, "Senha (mínimo 8 caracteres; será visível neste terminal): ");
    $senha = rtrim((string) fgets(STDIN), "\r\n");
    validarSenha($senha);
    if ($nome === '' || strlen($nome) > 200) throw new InvalidArgumentException('Informe um nome válido.');
    consultar("INSERT INTO usuarios (nome, login, senha_hash, perfil) VALUES (?, ?, ?, 'admin')",
        [$nome, $login, password_hash($senha, PASSWORD_DEFAULT)]);
    fwrite(STDOUT, "Administrador criado. Acesse index.php para entrar.\n");
} catch (Throwable $e) {
    fwrite(STDERR, $e instanceof InvalidArgumentException ? $e->getMessage() . "\n" : "Não foi possível criar. Confira o SQLite, a pasta de dados e se o login já existe.\n");
    exit(1);
}
