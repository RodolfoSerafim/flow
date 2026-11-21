const botaoCopiar = document.getElementById('copiar-acesso');
const mensagemAcesso = document.getElementById('mensagem-acesso');
const statusCopia = document.getElementById('status-copia');
botaoCopiar?.addEventListener('click', async () => {
    mensagemAcesso.focus();
    mensagemAcesso.select();
    try {
        if (!navigator.clipboard) throw new Error('Clipboard indisponível');
        await navigator.clipboard.writeText(mensagemAcesso.value);
        statusCopia.textContent = 'Acesso copiado. Agora você pode colar a mensagem e enviar ao funcionário.';
    } catch {
        statusCopia.textContent = 'A mensagem está selecionada. Copie com Ctrl+C ou use a opção Copiar do seu celular.';
    }
});
