const port = 3090;
const gpio_port = 3091;
const bcrypt = (() => {
  try { return require('bcrypt'); }
  catch(e) { return equire('bcryptjs'); }
})();

module.exports = {
  port: port,
  gpio_port: gpio_port,
  server_port: 3092,
  udp: {
    host: 'localhost',
    port: port,
  },
  docomo: {
    api_key: process.env.DOCOMO_API_KEY || '',
    app_id:  process.env.DOCOMO_APP_ID  || '',
  },
  voice_hat: true,
  usb_mic:   false,
  editor_full_access: true,
  home: process.env.HOME,
  use_db: (process.env.ROBOT_DB==='true'),
  session_secret: process.env.ROBOT_SECRET_KEY || 'robot-session-cat',
  robot_secret_key: process.env.ROBOT_SECRET_KEY || 'robot-session-cat',
  robot_private_key: process.env.ROBOT_PRIVATE_KEY || null,
  robot_public_key: process.env.ROBOT_PUBLIC_KEY || null,
  adminAuth: [
    //管理者用
    {
      username: 'admin',
      password: '$2b$08$4r.XgxukN5Bo/BrlDW6aYObEJgSC4o5NXOkTlGO71xQAumhHJJN72',
      permissions: '*',
    },
    //クイズ参加者用
    {
      username: 'player',
      password: '$2b$08$7ZZ1ndbn.GG5p/WBk9WsMOZPy4pLf75vvJYbHOFkHDwWXGIqjVvfm',
      permissions: ['result.read', 'command.write',],
      guest: true,
    },
    //動画/画像サーバー用
    {
      username: 'guest-client',
      password: '$2b$08$yxLRwXjWVkJStJNNAlz5pe43xG7aLcExyViyzstVPMMVBdUe4blyi',
      permissions: ['image-server.read'],
      guest: true,
    },
  ],
  localhostPermissions: '*',
  defualtUserPermissions: '*',
  startScript: {
    //自動起動させる場合はここをtrueにする
    auto: false,
    //ユーザー名
    username: 'raspberrypi',
    //開始したいスクリプト
    filename: '最初のファイル.txt',
  },
}

if (require.main === module) {
  //bcryptを使ってパスワードのハッシュを作ってadminAuto.passwordに設定する
  console.log(bcrypt.hashSync('robotnopass', 8));
  console.log(bcrypt.hashSync('playernopass', 8));
  console.log(bcrypt.hashSync('guestclientnopass', 8));
}
