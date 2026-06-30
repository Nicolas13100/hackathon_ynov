# Gestion des branches Git

## Contexte

Le dépôt Git d'origine ne permettait pas la création ni le **push** de nouvelles branches en raison des restrictions de configuration du projet.

Afin de pouvoir poursuivre le développement sans modifier le dépôt d'origine, nous avons réalisé un **fork** du projet.

## Organisation retenue

* La branche **`main`** est restée **strictement inchangée**.
* L'ensemble des développements et des modifications a été réalisé sur la branche **`groupe-aix-6Kayou`** du dépôt forké.

Cette approche permet de :

* préserver l'intégrité de la branche principale (`main`) ;
* centraliser toutes les modifications sur une branche dédiée ;
* faciliter la revue et l'intégration des changements ultérieurement.

## Dépôt Git

Le dépôt contenant l'ensemble des modifications est disponible à l'adresse suivante :

**[https://github.com/Nicolas13100/hackathon_ynov/](https://github.com/Nicolas13100/hackathon_ynov/)**

## Récupération du projet

Cloner le dépôt :

```bash
git clone https://github.com/Nicolas13100/hackathon_ynov.git
```

Accéder au dossier du projet :

```bash
cd hackathon_ynov
```

Se placer sur la branche de développement :

```bash
git checkout groupe-aix-6Kayou
```

Si la branche n'est pas encore présente localement :

```bash
git fetch origin
git checkout -b groupe-aix-6Kayou origin/groupe-aix-6Kayou
```

Vérifier la branche active :

```bash
git branch
```

Le résultat attendu est :

```text
* groupe-aix-6Kayou
  main
```

> **Important :** toutes les modifications du projet se trouvent sur la branche **`groupe-aix-6Kayou`**. La branche **`main`** a volontairement été laissée intacte.
