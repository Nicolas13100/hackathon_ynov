# Gestion des branches Git

## Contexte

Le dépôt Git ne permettait pas la création ou le push de nouvelles branches en raison des restrictions de configuration du projet.

Afin de pouvoir poursuivre le développement sans impacter la branche principale, nous avons réalisé un **fork** du dépôt.

## Organisation retenue

* La branche **`main`** est restée **strictement inchangée**.
* L'ensemble des développements et des modifications a été réalisé sur la branche **`groupe-aix-6Kayou`** du dépôt forké.

Cette approche permet de :

* préserver l'intégrité de la branche principale (`main`) ;
* centraliser toutes les modifications sur une branche dédiée ;
* faciliter la revue et l'intégration des changements ultérieurement.