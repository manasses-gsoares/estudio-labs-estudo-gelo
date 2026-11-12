# Estudo de gelo — Estúdio Labs

Página interativa (celular e desktop) com dois efeitos de gelo feitos **por código**: nenhuma malha, textura ou shader de terceiro.

- **Torrente de gelo** — toque no chão: uma frente de fratura corre pelo piso e os cristais irrompem atrás dela, crescendo com a distância, com geada e névoa rasteira.
- **Coroa de gelo** — toque no chão: um anel de lâminas irrompe em sequência e congela um disco no piso.

## Como usar

- Toque (ou clique) no chão para lançar.
- Arraste para girar a câmera; pinça (ou roda do mouse) para aproximar.
- Botões: escolher o efeito e limpar a cena.

Funciona offline depois de carregada; o three.js vai junto no repositório (`vendor/`).

## Como foi feito

- Three.js r170 + shaders GLSL escritos aqui: cristal facetado com bandas toon, fresnel e especular; geada no piso com veios por ruído; névoa aditiva; flocos em pontos.
- Cada cristal recebe posição, escala, giro e semente por atributo de instância, então o efeito é **determinístico**: o mesmo tempo gera o mesmo quadro (é o que permite levar isso para o Remotion depois).
- Estudo feito a partir da **técnica** de sandboxes públicos de VFX (a frente de fratura que corre pela linha). Nenhuma linha de código, asset ou nome de API foi copiado.

## Licença

Código deste repositório: MIT (veja `LICENSE`). Three.js: MIT, © three.js authors.

Estúdio Labs · 2026
