<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$arquivo = __DIR__ . '/config.local.php';
if (is_file($arquivo)) {
    fwrite(STDERR, "A configuração local já existe. Ela não foi alterada.\n");
    exit(1);
}
$pastaDados = __DIR__ . '/data';
if ((!is_dir($pastaDados) && !mkdir($pastaDados, 0700, true))
    || file_put_contents($pastaDados . '/.htaccess', "Require all denied\n") === false
    || file_put_contents($pastaDados . '/index.php', "<?php\nhttp_response_code(404);\nexit;\n") === false) {
    fwrite(STDERR, "Não foi possível preparar a pasta protegida de dados.\n");
    exit(1);
}
$chave = bin2hex(random_bytes(32));
$hash = password_hash($chave, PASSWORD_DEFAULT);
$conteudo = "<?php\n// Configuração privada desta instalação. Não enviar ao GitHub.\nreturn [\n    'database_path' => __DIR__ . '/data/flow.sqlite',\n    'setup_token_hash' => " . var_export($hash, true) . ",\n];\n";
$handle = fopen($arquivo, 'x');
if (!$handle || fwrite($handle, $conteudo) !== strlen($conteudo)) {
    fwrite(STDERR, "Não foi possível gravar a configuração local.\n");
    exit(1);
}
fclose($handle);
@chmod($arquivo, 0600);
fwrite(STDOUT, "Configuração criada para hospedagem compartilhada.\nChave de instalação: $chave\nGuarde a chave em local privado e use-a em instalar.php, por HTTPS.\n");
