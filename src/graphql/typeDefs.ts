export const typeDefs = /* GraphQL */ `
  type User {
    id: ID!
    clerkId: String!
    email: String!
    name: String!
  }

  type Audio {
    id: ID!
    topic: String!
    title: String!
    script: String
    audioUrl: String
    lengthMinutes: Int
    format: String!
    tones: String!
    radioStyle: String
    createdAt: String!
  }

  type Query {
    me: User
  }

  type Mutation {
    """
    Updates the user's email in Clerk and mirrors it to the local DB.
    """
    changeEmail(newEmail: String!): User!
    """
    Updates only the email column for the signed-in user in the local database.
    Does not call Clerk — use when you manage email elsewhere or want a manual DB fix.
    """
    changeEmailInDb(newEmail: String!): User!
    """
    Creates scripted audio from topic, format, tone description, and target length (minutes).
    Matches the mobile/web client input shape.
    """
    createAudio(
      topic: String!
      format: String!
      tones: String!
      lengthMinutes: Int!
    ): Audio!
  }
`;
