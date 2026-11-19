<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$arquivoTeste = sys_get_temp_dir() . '/flow-teste-' . bin2hex(random_bytes(8)) . '.sqlite';
putenv('FLOW_DB_PATH=' . $arquivoTeste);
register_shutdown_function(function () use ($arquivoTeste): void {
    foreach ([$arquivoTeste, $arquivoTeste . '-journal', $arquivoTeste . '-wal', $arquivoTeste . '-shm'] as $arquivo) {
        if (is_file($arquivo)) @unlink($arquivo);
    }
});
require __DIR__ . '/bootstrap.php';
$verificacoes = 0;
function verificar(bool $condicao, string $mensagem): void {
    global $verificacoes;
    if (!$condicao) throw new RuntimeException($mensagem);
    $verificacoes++;
}
function deveFalhar(callable $acao, string $mensagem): void {
    try { $acao(); } catch (InvalidArgumentException $e) { verificar(true, $mensagem); return; }
    throw new RuntimeException($mensagem);
}
function envelhecer(int $id): void {
    consultar('UPDATE pontos SET registrado_em = ? WHERE id = (SELECT MAX(id) FROM pontos WHERE usuario_id = ?)', [(new DateTimeImmutable('-1 minute'))->format('Y-m-d\TH:i:sP'), $id]);
}
try {
    $dados = validarColaborador(['nome' => 'Funcionário Teste', 'cargo' => 'Porteiro', 'admissao' => '2026-01-01', 'entrada' => '18:00', 'saida' => '06:00', 'login' => 'funcionario.teste', 'senha' => 'Teste123456!']);
    consultar("INSERT INTO usuarios (nome, cargo, admissao, entrada, saida, login, senha_hash, perfil) VALUES (?, ?, ?, ?, ?, ?, ?, 'colaborador')", $dados);
    $id = (int) banco()->lastInsertId();
    verificar(password_verify('Teste123456!', consultar('SELECT senha_hash FROM usuarios WHERE id = ?', [$id])->fetchColumn()), 'Senha não foi salva como hash válido.');
    $requisicao = bin2hex(random_bytes(32));
    registrarPonto($id, 'entrada', $requisicao);
    registrarPonto($id, 'entrada', $requisicao);
    verificar((int) consultar('SELECT COUNT(*) FROM pontos WHERE usuario_id = ?', [$id])->fetchColumn() === 1, 'Reenvio duplicou a batida.');
    deveFalhar(fn() => registrarPonto($id, 'entrada', bin2hex(random_bytes(32))), 'Aceitou entrada consecutiva.');
    deveFalhar(fn() => registrarPonto($id, 'saida', bin2hex(random_bytes(32))), 'Aceitou batidas com menos de 10 segundos.');
    envelhecer($id);
    registrarPonto($id, 'saida_intervalo', bin2hex(random_bytes(32)));
    envelhecer($id);
    deveFalhar(fn() => registrarPonto($id, 'saida', bin2hex(random_bytes(32))), 'Permitiu sair sem retornar do intervalo.');
    registrarPonto($id, 'retorno_intervalo', bin2hex(random_bytes(32)));
    envelhecer($id);
    registrarPonto($id, 'saida', bin2hex(random_bytes(32)));
    verificar((int) consultar('SELECT COUNT(*) FROM pontos WHERE usuario_id = ?', [$id])->fetchColumn() === 4, 'Jornada completa não foi persistida.');
    envelhecer($id);
    registrarPonto($id, 'entrada', bin2hex(random_bytes(32)));
    consultar('UPDATE pontos SET registrado_em = ? WHERE id = (SELECT MAX(id) FROM pontos WHERE usuario_id = ?)', [(new DateTimeImmutable('yesterday 18:00'))->format('Y-m-d\TH:i:sP'), $id]);
    registrarPonto($id, 'saida', bin2hex(random_bytes(32)));
    verificar(ultimoPonto($id)['tipo'] === 'saida', 'Não concluiu jornada que atravessou a meia-noite.');
    consultar('UPDATE usuarios SET ativo = 0 WHERE id = ?', [$id]);
    deveFalhar(fn() => registrarPonto($id, 'entrada', bin2hex(random_bytes(32))), 'Colaborador inativo bateu ponto.');
    verificar((int) consultar('SELECT COUNT(*) FROM pontos WHERE usuario_id = ?', [$id])->fetchColumn() === 6, 'Desativação alterou o histórico.');
    consultar("INSERT INTO usuarios (nome, login, senha_hash, perfil) VALUES ('Administrador Teste', 'admin.teste', ?, 'admin')", [password_hash('Teste123456!', PASSWORD_DEFAULT)]);
    $admin = (int) banco()->lastInsertId();
    deveFalhar(fn() => registrarPonto($admin, 'entrada', bin2hex(random_bytes(32))), 'Administrador registrou ponto sem cadastro de colaborador.');
    verificar((int) consultar('SELECT COUNT(*) FROM pontos WHERE usuario_id = ?', [$admin])->fetchColumn() === 0, 'Ponto foi vinculado ao usuário errado.');
    deveFalhar(fn() => validarColaborador(['nome' => 'Teste', 'cargo' => 'Porteiro', 'admissao' => '2026-02-30', 'entrada' => '06:00', 'saida' => '18:00', 'login' => 'teste', 'senha' => 'Teste123456!']), 'Aceitou data inválida.');
    deveFalhar(fn() => validarSenha('123'), 'Aceitou senha curta.');
    try {
        $duplicado = $dados; $duplicado[5] = 'FUNCIONARIO.TESTE';
        consultar("INSERT INTO usuarios (nome, cargo, admissao, entrada, saida, login, senha_hash, perfil) VALUES (?, ?, ?, ?, ?, ?, ?, 'colaborador')", $duplicado);
        throw new RuntimeException('Aceitou login duplicado com outra capitalização.');
    } catch (PDOException $e) { verificar((string) $e->getCode() === '23000', 'Erro inesperado ao validar duplicidade.'); }
    fwrite(STDOUT, "OK: $verificacoes verificações passaram.\n");
} catch (Throwable $e) {
    fwrite(STDERR, $e->getMessage() . "\n"); exit(1);
}

