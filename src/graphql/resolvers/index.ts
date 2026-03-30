import { me } from './query';
import { changeEmail, changeEmailInDb } from './mutations/email';
import { createAudio } from './mutations/createAudio';

export const resolvers = {
  Query: {
    me,
  },
  Mutation: {
    changeEmail,
    changeEmailInDb,
    createAudio,
  },
};
