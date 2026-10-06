export interface SeedCard {
  sentence: string; // exactly one ___ blank
  answer: string[]; // ordered words filling the blank
  distractors: string[]; // wrong words; answer + distractors = 4..8 words
  translation: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
}

const c = (
  difficulty: SeedCard['difficulty'],
  sentence: string,
  answer: string[],
  distractors: string[],
  translation: string,
): SeedCard => ({ sentence, answer, distractors, translation, difficulty });

export const SEED_CARDS: SeedCard[] = [
  // Level 1: present tense basics
  c(1, 'Yo ___ agua.', ['bebo'], ['bebes', 'bebe', 'mesa', 'rojo'], 'I drink water.'),
  c(1, 'El gato es ___.', ['negro'], ['negra', 'negros', 'comer', 'yo'], 'The cat is black.'),
  c(1, 'Ella ___ en Madrid.', ['vive'], ['vivo', 'vives', 'azul', 'pan'], 'She lives in Madrid.'),
  c(1, 'Nosotros ___ pan.', ['comemos'], ['como', 'comen', 'come', 'libro'], 'We eat bread.'),
  c(1, 'Tú ___ muy amable.', ['eres'], ['soy', 'es', 'somos', 'casa'], 'You are very kind.'),
  c(1, 'La casa es ___.', ['grande'], ['grandes', 'comer', 'tú', 'mi'], 'The house is big.'),
  c(1, 'Me gusta el ___.', ['café'], ['cafés', 'tú', 'corro', 'ellos'], 'I like coffee.'),
  c(1, 'Ellos ___ al parque.', ['van'], ['voy', 'vas', 'vamos', 'rojo'], 'They go to the park.'),
  c(1, 'Buenos ___, señora.', ['días'], ['día', 'noches', 'tarde', 'gato'], 'Good morning, madam.'),
  c(1, 'Mi hermano tiene dos ___.', ['perros'], ['perro', 'comer', 'azul', 'bebes'], 'My brother has two dogs.'),

  // Level 2: everyday phrases
  c(2, '___ mi casa.', ['Esta', 'es'], ['Este', 'son', 'eres', 'tú', 'soy'], 'This is my house.'),
  c(2, 'Mañana ___ a mi abuela.', ['voy', 'a', 'visitar'], ['vas', 'visito', 'rojo'], 'Tomorrow I am going to visit my grandmother.'),
  c(2, 'Hoy ___ mucho frío.', ['hace'], ['hacen', 'es', 'está', 'rojo'], 'It is very cold today.'),
  c(2, 'Yo ___ hambre.', ['tengo'], ['soy', 'estoy', 'tienes', 'azul'], 'I am hungry.'),
  c(2, '¿Dónde ___ el baño?', ['está'], ['es', 'están', 'eres', 'comer'], 'Where is the bathroom?'),
  c(2, 'Ellos ___ español en la escuela.', ['aprenden'], ['aprendo', 'aprende', 'aprendemos', 'rojo'], 'They learn Spanish at school.'),
  c(2, 'La niña ___ una carta.', ['escribe'], ['escribo', 'escribes', 'escriben', 'mesa'], 'The girl writes a letter.'),
  c(2, 'Nosotros ___ en el parque.', ['jugamos'], ['juego', 'juegan', 'jugar', 'rojo'], 'We play in the park.'),
  c(2, 'Mi madre ___ muy bien.', ['cocina'], ['cocinas', 'cocino', 'cocinar', 'casa'], 'My mother cooks very well.'),
  c(2, 'Me ___ estudiar español.', ['gusta'], ['gustan', 'gusto', 'gustas', 'azul'], 'I like studying Spanish.'),

  // Level 3: past, future, progressive
  c(3, 'Ayer yo ___ al mercado.', ['fui'], ['voy', 'iré', 'fue', 'vas', 'rojo'], 'Yesterday I went to the market.'),
  c(3, 'Mañana ___ a mis abuelos.', ['visitaré'], ['visité', 'visitaba', 'visitaste', 'mesa'], 'Tomorrow I will visit my grandparents.'),
  c(3, 'Ella ___ leyendo un libro.', ['está'], ['es', 'están', 'estás', 'leer'], 'She is reading a book.'),
  c(3, 'No ___ nada en la nevera.', ['hay'], ['está', 'es', 'son', 'azul'], 'There is nothing in the fridge.'),
  c(3, 'Me gustaría ___ un café, por favor.', ['tomar'], ['tomo', 'tomas', 'tomó', 'azul'], 'I would like to have a coffee, please.'),
  c(3, 'Hace dos años que yo ___ en esta ciudad.', ['vivo'], ['vives', 'vive', 'vivir', 'azul'], 'I have lived in this city for two years.'),
  c(3, 'Cuando era niño, ___ en el campo.', ['vivía'], ['vivo', 'viviré', 'vivir', 'azul'], 'When I was a child, I lived in the countryside.'),
  c(3, 'Nos quedamos en casa ___ llovía mucho.', ['porque'], ['por', 'qué', 'sino', 'azul'], 'We stayed at home because it was raining a lot.'),
  c(3, 'Esta tarde yo ___ a estudiar con mis amigos.', ['voy'], ['vas', 'van', 'vamos', 'ir'], 'This afternoon I am going to study with my friends.'),
  c(3, 'Hace años que yo no ___ a mis primos.', ['veo'], ['ves', 've', 'ver', 'azul'], "I haven't seen my cousins for years."),

  // Level 4: subjunctive intro, compound structures
  c(4, 'Si ___ dinero, viajaría por el mundo.', ['tuviera'], ['tengo', 'tendré', 'tenía', 'azul'], 'If I had money, I would travel the world.'),
  c(4, 'Aunque ___ cansado, fui al gimnasio.', ['estaba'], ['esté', 'estar', 'estás', 'azul'], 'Although I was tired, I went to the gym.'),
  c(4, 'Ojalá que mañana ___ buen tiempo.', ['haga'], ['hace', 'hizo', 'hacer', 'azul'], 'I hope the weather is good tomorrow.'),
  c(4, 'No creo que ella ___ la verdad.', ['sepa'], ['sabe', 'saber', 'sabes', 'azul'], "I don't think she knows the truth."),
  c(4, 'Se me ___ las llaves en casa.', ['olvidaron'], ['olvidó', 'olvidé', 'olvidar', 'azul'], 'I forgot my keys at home.'),
  c(4, 'Llevo tres años ___ español.', ['estudiando'], ['estudiar', 'estudio', 'estudiado', 'azul'], 'I have been studying Spanish for three years.'),
  c(4, 'Cuando llegué, ya ___ la cena.', ['habían', 'preparado'], ['han', 'preparar', 'estaban', 'azul'], 'When I arrived, they had already prepared dinner.'),
  c(4, 'Es la película más ___ que he visto.', ['interesante'], ['interesantes', 'interesada', 'interesar', 'azul'], 'It is the most interesting film I have seen.'),
  c(4, 'Me dijo que ___ venir más tarde.', ['iba', 'a'], ['voy', 'vaya', 'ir', 'azul'], 'He told me he was going to come later.'),
  c(4, 'Te llamaré en cuanto ___ a casa.', ['llegue'], ['llegaré', 'llegar', 'llegué', 'azul'], 'I will call you as soon as I get home.'),

  // Level 5: advanced subjunctive and conditionals
  c(5, 'Quiero que tú ___ conmigo.', ['vengas'], ['vienes', 'vienen', 'venir', 'mesa'], 'I want you to come with me.'),
  c(5, 'Es importante que nosotros ___ temprano.', ['lleguemos'], ['llegamos', 'llegar', 'llegan', 'azul'], 'It is important that we arrive early.'),
  c(5, 'Él me pidió que le ___ el libro.', ['devolviera'], ['devuelvo', 'devolveré', 'devolver', 'azul'], 'He asked me to give him back the book.'),
  c(5, 'Si hubiera sabido la verdad, no ___ venido.', ['habría'], ['haber', 'he', 'hay', 'azul'], 'If I had known the truth, I would not have come.'),
  c(5, 'Espero que ___ pasado un buen fin de semana.', ['hayas'], ['has', 'habías', 'hubieras', 'azul'], 'I hope you had a good weekend.'),
  c(5, 'Por más que ___, no lo conseguía.', ['lo', 'intentaba'], ['intento', 'intentar', 'le', 'azul'], 'No matter how much I tried, I could not manage it.'),
  c(5, 'Me sorprendió que no ___ nadie en la fiesta.', ['hubiera'], ['hay', 'haya', 'haber', 'azul'], 'It surprised me that nobody was at the party.'),
  c(5, 'A pesar de que ___ mucho, no aprobó el examen.', ['estudió'], ['estudia', 'estudiar', 'estudie', 'azul'], 'Although he studied a lot, he did not pass the exam.'),
  c(5, 'Ojalá ___ más tiempo para viajar.', ['tuviera'], ['tengo', 'tendré', 'tener', 'azul'], 'I wish I had more time to travel.'),
  c(5, 'Dudo que ellos ___ a tiempo.', ['lleguen'], ['llegan', 'llegar', 'llegarán', 'azul'], 'I doubt they will arrive on time.'),
];
