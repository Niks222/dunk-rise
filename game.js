const canvas = document.getElementById("game")
const ctx = canvas.getContext("2d")

canvas.width = window.innerWidth
canvas.height = window.innerHeight

let score = 0
let stars = 0
let combo = 0

let gravity = 0.6
let friction = 0.995

let currentSkin = 0

const skins = [
    { id:0, name:"Classic", price:0, color:"orange"},
    { id:1, name:"Fire", price:100, color:"red"},
    { id:2, name:"Neon", price:250, color:"cyan"}
]

let ball = {
    x:canvas.width/2,
    y:canvas.height-120,
    vx:0,
    vy:0,
    r:15,
    rotation:0
}

let hoop = {
    x:canvas.width/2,
    y:200,
    w:140
}

let hoopDirection = 1

let trail = []

function drawBall(){

    ctx.save()

    ctx.translate(ball.x,ball.y)
    ctx.rotate(ball.rotation)

    ctx.beginPath()
    ctx.arc(0,0,ball.r,0,Math.PI*2)
    ctx.fillStyle = skins[currentSkin].color
    ctx.fill()

    ctx.restore()
}

function drawHoop(){

    ctx.strokeStyle="orange"
    ctx.lineWidth=6

    ctx.beginPath()

    ctx.moveTo(
        hoop.x-hoop.w/2,
        hoop.y
    )

    ctx.lineTo(
        hoop.x+hoop.w/2,
        hoop.y
    )

    ctx.stroke()
}

function drawTrail(){

    trail.forEach((p,i)=>{

        ctx.beginPath()
        ctx.arc(p.x,p.y,3,0,Math.PI*2)

        ctx.fillStyle="rgba(255,80,80,"+(i/trail.length)+")"

        ctx.fill()

    })

}

function updateUI(){

    document.getElementById("score").innerText = score
    document.getElementById("stars").innerText = "⭐ "+stars

}

function physics(){

    ball.vy += gravity

    ball.x += ball.vx
    ball.y += ball.vy

    ball.vx *= friction
    ball.vy *= friction

    ball.rotation += ball.vx*0.02

    trail.push({x:ball.x,y:ball.y})

    if(trail.length > 25){
        trail.shift()
    }

    hoop.x += 2 * hoopDirection

    if(hoop.x > canvas.width-80 || hoop.x < 80){
        hoopDirection *= -1
    }

    if(ball.y > canvas.height){
        resetBall()
        combo = 0
    }

    checkScore()

}

function checkScore(){

    if(
        ball.y < hoop.y &&
        ball.y > hoop.y-10 &&
        ball.x > hoop.x-hoop.w/2 &&
        ball.x < hoop.x+hoop.w/2
    ){

        combo++

        score += 1 + combo

        stars += 10

        hoop.y -= 120

        updateUI()

    }

}

function resetBall(){

    ball.x = canvas.width/2
    ball.y = canvas.height-120

    ball.vx = 0
    ball.vy = 0

    trail = []

}

canvas.addEventListener("click", e => {

    const rect = canvas.getBoundingClientRect()

    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    const dx = mx - ball.x
    const dy = my - ball.y

    ball.vx = dx * 0.05
    ball.vy = dy * 0.05

})

function buySkin(id){

    if(stars >= skins[id].price){

        stars -= skins[id].price

        currentSkin = id

        updateUI()

    }

}

function sendScore(){

    if(typeof Telegram !== "undefined"){

        const user = Telegram.WebApp.initDataUnsafe.user

        fetch("http://localhost:8000/save_score",{

            method:"POST",

            headers:{
                "Content-Type":"application/json"
            },

            body:JSON.stringify({
                user_id:user.id,
                score:score,
                stars:stars
            })

        })

    }

}

function gameLoop(){

    ctx.clearRect(0,0,canvas.width,canvas.height)

    physics()

    drawTrail()
    drawBall()
    drawHoop()

    requestAnimationFrame(gameLoop)

}

setInterval(sendScore,10000)

updateUI()

gameLoop()